import { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/components/AuthProvider';
import { calculateMetrics } from '@/lib/trade-metrics';
import { parseNumber, inferSide, normalizeSymbol, parseTags, validateDateTime } from '@/utils/normalise';

type Trade = Tables<'trades'>;
type Journal = Tables<'journals'>;

interface CsvRow {
  [key: string]: string | number | undefined;
}

interface ProcessingSummary {
  totalRows: number;
  validTrades: number;
  mockDataFiltered: number;
  duplicatesSkipped: number;
  parseErrors: number;
  insertedTrades: number;
  skippedDuplicates: number;
  fileName: string;
}

interface ColumnMapping {
  [key: string]: string;
}

/** Check if data appears to be mock/demo data */
const isMockData = (trade: any): boolean => {
  const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE'];
  const symbol = (trade.symbol || '').toString().toUpperCase().trim();
  
  if (mockSymbols.includes(symbol)) return true;
  if (symbol.includes('TEST') || symbol.includes('DEMO') || symbol.includes('SAMPLE')) return true;
  if (trade.notes && trade.notes.includes('Mock trade')) return true;
  
  return false;
};

/** Validate trade data with detailed error reporting */
const validateTradeData = (trade: any, rowIndex: number): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!trade.datetime) {
    errors.push(`Row ${rowIndex}: Missing datetime`);
  }
  
  if (!trade.symbol || trade.symbol.toString().trim().length === 0) {
    errors.push(`Row ${rowIndex}: Missing or empty symbol`);
  }
  
  if (!trade.side || !['BUY', 'SELL'].includes(trade.side)) {
    errors.push(`Row ${rowIndex}: Invalid or missing side (must be BUY or SELL)`);
  }
  
  if (!trade.qty || isNaN(trade.qty) || Math.abs(trade.qty) <= 0) {
    errors.push(`Row ${rowIndex}: Invalid quantity (must be positive number)`);
  }
  
  if (!trade.price || isNaN(trade.price) || trade.price <= 0) {
    errors.push(`Row ${rowIndex}: Invalid price (must be positive number)`);
  }
  
  if (trade.pnl === undefined || trade.pnl === null || isNaN(trade.pnl)) {
    errors.push(`Row ${rowIndex}: Missing or invalid P&L value`);
  }
  
  return { isValid: errors.length === 0, errors };
};

/** Enhanced duplicate detection with multiple strategies */
const removeCsvDuplicates = (trades: any[]): { unique: any[], duplicates: any[] } => {
  const seen = new Set<string>();
  const unique: any[] = [];
  const duplicates: any[] = [];
  
  console.log(`🔍 Starting CSV duplicate detection for ${trades.length} trades`);
  
  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    let keys: string[] = [];
    let strategy = 'none';
    
    // Strategy 1: Both fill IDs present (highest precision)
    if (trade.buy_fill_id && trade.sell_fill_id) {
      keys.push(`both_fills:${trade.buy_fill_id}:${trade.sell_fill_id}`);
      strategy = 'both_fills';
    }
    
    // Strategy 2: Individual fill IDs (medium precision)
    if (trade.buy_fill_id) {
      keys.push(`buy_fill:${trade.buy_fill_id}:${trade.datetime}:${trade.symbol}`);
      if (strategy === 'none') strategy = 'buy_fill';
    }
    if (trade.sell_fill_id) {
      keys.push(`sell_fill:${trade.sell_fill_id}:${trade.datetime}:${trade.symbol}`);
      if (strategy === 'none') strategy = 'sell_fill';
    }
    
    // Strategy 3: Strict composite key (lower precision)
    const strictComposite = [
      'strict',
      trade.journal_id,
      trade.datetime,
      (trade.symbol || '').toString().toUpperCase().trim(),
      (trade.side || '').toString().toUpperCase().trim(),
      Number(trade.qty || 0).toString(),
      Number(trade.price || 0).toFixed(4), // More precision for prices
      Number(trade.pnl || 0).toFixed(4)    // More precision for PnL
    ].join('|');
    keys.push(strictComposite);
    if (strategy === 'none') strategy = 'strict_composite';
    
    // Check if any of the keys have been seen before
    let isDuplicate = false;
    let matchedKey = '';
    
    for (const key of keys) {
      if (seen.has(key)) {
        isDuplicate = true;
        matchedKey = key;
        break;
      }
    }
    
    if (isDuplicate) {
      duplicates.push(trade);
      console.log(`🔍 CSV Duplicate found (${strategy}):`, {
        symbol: trade.symbol,
        datetime: trade.datetime,
        pnl: trade.pnl,
        buyFillId: trade.buy_fill_id,
        sellFillId: trade.sell_fill_id,
        matchedKey: matchedKey.substring(0, 100) + '...'
      });
    } else {
      // Add all keys to seen set
      keys.forEach(key => seen.add(key));
      unique.push(trade);
      console.log(`✅ Unique trade (${strategy}):`, {
        symbol: trade.symbol,
        datetime: trade.datetime,
        pnl: trade.pnl,
        fillIds: `${trade.buy_fill_id || 'none'}/${trade.sell_fill_id || 'none'}`
      });
    }
  }
  
  console.log(`📊 CSV Deduplication complete: ${trades.length} → ${unique.length} (removed ${duplicates.length})`);
  return { unique, duplicates };
};

export const useProcessCsv = (journal: Journal) => {
  const { user } = useAuth();
  const [loadingMessage, setLoadingMessage] = useState('');
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [csvData, setCsvData] = useState<CsvRow[] | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');

  const processCsv = async (file: File) => {
    if (!user || !journal.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in and have a journal selected.',
        variant: 'destructive'
      });
      return;
    }

    console.log(`🚀 Processing CSV: ${file.name} (${file.size} bytes)`);
    setLoadingMessage('Reading and parsing CSV file...');
    setFileName(file.name);
    
    try {
      const text = await file.text();
      console.log(`📄 File content length: ${text.length} characters`);

      Papa.parse<CsvRow>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        complete: async (results) => {
          console.log(`📊 CSV Parse Results:`);
          console.log(`  - Rows parsed: ${results.data.length}`);
          console.log(`  - Headers: [${results.meta?.fields?.join(', ')}]`);
          console.log(`  - Parse errors: ${results.errors.length}`);
          
          if (results.errors.length > 0) {
            console.log(`❌ Parse errors:`, results.errors.slice(0, 5));
          }

          if (results.data.length === 0) {
            throw new Error('The CSV file appears to be empty or has no valid data rows.');
          }

          setCsvData(results.data);
          setCsvHeaders(results.meta?.fields || []);

          try {
            await validateAndMapColumns(results, file.name);
          } catch (error) {
            console.error('❌ Error in validateAndMapColumns:', error);
            toast({ 
              title: 'Processing Error', 
              description: (error as Error).message, 
              variant: 'destructive' 
            });
            setLoadingMessage('');
          }
        },
        error: (error) => {
          console.error('❌ CSV parsing failed:', error);
          toast({ 
            title: 'CSV Parsing Error', 
            description: `Failed to parse CSV: ${error.message}`, 
            variant: 'destructive' 
          });
          setLoadingMessage('');
        }
      });
    } catch (error) {
      console.error('❌ File reading failed:', error);
      toast({ 
        title: 'File Error', 
        description: 'Could not read the CSV file. Please check the file format and try again.', 
        variant: 'destructive' 
      });
      setLoadingMessage('');
    }
  };

  const validateAndMapColumns = async (results: Papa.ParseResult<CsvRow>, fileName: string) => {
    const csvHeaders = results.meta?.fields || [];
    const csvData = results.data;

    console.log(`🔍 Processing ${csvData.length} rows with headers:`, csvHeaders);

    /* ------------ Step 1: Validate this is trading data ------------ */
    setLoadingMessage('Validating CSV content...');
    
    const sampleData = csvData.slice(0, Math.min(5, csvData.length));
    console.log(`📋 Sample data for validation:`, sampleData);

    try {
      const { data: validationData, error: validationError } = await supabase.functions.invoke<
        { is_trading_related: boolean }
      >('validate-csv-content', { body: { csvHeaders, csvDataSample: sampleData } });
      
      if (validationError) {
        console.error('❌ Validation service error:', validationError);
        throw validationError;
      }
      
      if (!validationData?.is_trading_related) {
        throw new Error('This CSV does not appear to contain trading data. Please ensure your file has columns like symbol, date/time, side, quantity, price, and P&L.');
      }

      console.log('✅ CSV validated as trading data');
    } catch (error) {
      console.warn('⚠️ Validation service failed, proceeding with basic validation');
      // Continue with basic validation instead of failing
      const hasBasicColumns = csvHeaders.some(h => 
        h.toLowerCase().includes('symbol') || 
        h.toLowerCase().includes('pnl') || 
        h.toLowerCase().includes('price')
      );
      
      if (!hasBasicColumns) {
        throw new Error('This CSV does not appear to contain trading data. Please ensure your file has columns like symbol, date/time, side, quantity, price, and P&L.');
      }
    }

    /* ------------ Step 2: Map CSV columns to our schema ------------ */
    setLoadingMessage('Mapping CSV columns...');
    
    let headerMapping: Record<string, string> = {};
    
    try {
      const { data: mappingData, error: mappingError } = await supabase.functions.invoke<
        { mapping: Record<string, string> }
      >('map-columns-with-gemini', { body: { csvHeaders, csvDataSample: sampleData } });
      
      if (mappingError) {
        console.error('❌ Mapping service error:', mappingError);
        throw mappingError;
      }
      
      headerMapping = mappingData?.mapping || {};
      console.log('🗺️ Column mapping result:', headerMapping);
    } catch (error) {
      console.warn('⚠️ AI mapping failed, using fallback logic');
      // Use fallback mapping logic
      headerMapping = createFallbackMapping(csvHeaders);
    }

    setColumnMapping(headerMapping);
    setLoadingMessage('');
  };

  const processCSVWithMapping = async (finalMapping: ColumnMapping) => {
    if (!csvData || !user || !journal.id) return;

    setLoadingMessage('Processing trades with confirmed mapping...');

    const getVal = (row: CsvRow, key: string): any => {
      const header = finalMapping[key];
      if (header && row[header] !== undefined) {
        return row[header];
      }
      return undefined;
    };

    /* ------------ Step 3: Parse and validate all trades ------------ */
    setLoadingMessage(`Processing ${csvData.length} rows of trade data...`);
    
    const summary: ProcessingSummary = {
      totalRows: csvData.length,
      validTrades: 0,
      mockDataFiltered: 0,
      duplicatesSkipped: 0,
      parseErrors: 0,
      insertedTrades: 0,
      skippedDuplicates: 0,
      fileName
    };

    const validTrades: Array<TablesInsert<'trades'>> = [];
    const parseErrors: string[] = [];
    let emptyRowsSkipped = 0;

    console.log(`🔄 Processing ${csvData.length} CSV rows...`);

    for (let index = 0; index < csvData.length; index++) {
      const row = csvData[index];
      const rowNum = index + 1;
      
      // Skip completely empty rows
      const hasAnyData = Object.values(row).some(val => 
        val !== null && val !== undefined && val !== ''
      );
      
      if (!hasAnyData) {
        console.log(`⏭️ Row ${rowNum}: Skipping empty row`);
        emptyRowsSkipped++;
        continue;
      }
      
      try {
        // Extract raw values using confirmed mapping
        const datetimeRaw = getVal(row, 'datetime');
        const symbolRaw = getVal(row, 'symbol');
        const sideRaw = getVal(row, 'side');
        const qtyRaw = getVal(row, 'qty');
        const priceRaw = getVal(row, 'price');
        const buyPriceRaw = getVal(row, 'buyPrice');
        const sellPriceRaw = getVal(row, 'sellPrice');
        const pnlRaw = getVal(row, 'pnl');
        const notesRaw = getVal(row, 'notes') || '';
        const strategyRaw = getVal(row, 'strategy') || '';
        const tagsRaw = getVal(row, 'tags') || '';
        
        // Extract fill IDs with enhanced logging
        const buyFillIdRaw = getVal(row, 'buyFillId');
        const sellFillIdRaw = getVal(row, 'sellFillId');

        console.log(`📊 Row ${rowNum} raw data:`, {
          datetime: datetimeRaw,
          symbol: symbolRaw,
          side: sideRaw,
          qty: qtyRaw,
          price: priceRaw,
          pnl: pnlRaw,
          buyFillId: buyFillIdRaw,
          sellFillId: sellFillIdRaw
        });

        // Parse and validate datetime - prefer soldTimestamp, then boughtTimestamp, then datetime
        let datetime = validateDateTime(datetimeRaw as string);
        if (!datetime) {
          // Try alternative datetime fields
          const soldTimestamp = getVal(row, 'soldTimestamp');
          const boughtTimestamp = getVal(row, 'boughtTimestamp');
          
          if (soldTimestamp) {
            datetime = validateDateTime(soldTimestamp as string);
          } else if (boughtTimestamp) {
            datetime = validateDateTime(boughtTimestamp as string);
          }
        }
        
        if (!datetime) {
          parseErrors.push(`Row ${rowNum}: Invalid datetime "${datetimeRaw}"`);
          continue;
        }

        // Parse and validate symbol
        const symbol = normalizeSymbol(symbolRaw as string);
        if (!symbol) {
          parseErrors.push(`Row ${rowNum}: Invalid symbol "${symbolRaw}"`);
          continue;
        }

        // Parse numeric values
        const qty = parseNumber(qtyRaw);
        const price = parseNumber(priceRaw);
        const buyPrice = parseNumber(buyPriceRaw);
        const sellPrice = parseNumber(sellPriceRaw);
        const pnl = parseNumber(pnlRaw);

        // Determine best price
        let finalPrice = price;
        if (isNaN(finalPrice) && !isNaN(buyPrice)) finalPrice = buyPrice;
        if (isNaN(finalPrice) && !isNaN(sellPrice)) finalPrice = sellPrice;

        // Infer side
        const side = inferSide(
          sideRaw as string,
          qty,
          !isNaN(buyPrice) ? buyPrice : undefined,
          !isNaN(sellPrice) ? sellPrice : undefined
        );

        // Clean and validate fill IDs with enhanced processing
        let buyFillId: string | null = null;
        let sellFillId: string | null = null;
        
        if (buyFillIdRaw !== null && buyFillIdRaw !== undefined && buyFillIdRaw !== '') {
          buyFillId = buyFillIdRaw.toString().trim();
          if (buyFillId === '0' || buyFillId === 'null' || buyFillId === 'undefined') {
            buyFillId = null;
          }
        }
        
        if (sellFillIdRaw !== null && sellFillIdRaw !== undefined && sellFillIdRaw !== '') {
          sellFillId = sellFillIdRaw.toString().trim();
          if (sellFillId === '0' || sellFillId === 'null' || sellFillId === 'undefined') {
            sellFillId = null;
          }
        }

        // Build normalized trade
        const trade = {
          datetime: datetime.toISOString(),
          symbol,
          side,
          qty: Math.abs(qty),
          price: finalPrice,
          pnl,
          notes: notesRaw ? notesRaw.toString().trim() : null,
          strategy: strategyRaw ? strategyRaw.toString().trim() : null,
          tags: parseTags(tagsRaw as string),
          image_url: null,
          buy_fill_id: buyFillId,
          sell_fill_id: sellFillId,
          session_id: '', // Will be set later
          user_id: user.id,
          journal_id: journal.id
        };

        console.log(`📊 Row ${rowNum} processed trade:`, {
          symbol: trade.symbol,
          datetime: trade.datetime,
          pnl: trade.pnl,
          buyFillId: trade.buy_fill_id,
          sellFillId: trade.sell_fill_id,
          hasFillIds: !!(trade.buy_fill_id || trade.sell_fill_id)
        });

        // Validate the trade
        const validation = validateTradeData(trade, rowNum);
        if (!validation.isValid) {
          parseErrors.push(...validation.errors);
          continue;
        }

        // Check for mock data and count it
        if (isMockData(trade)) {
          console.warn(`⚠️ Row ${rowNum}: Skipping mock data for symbol ${symbol}`);
          summary.mockDataFiltered++;
          continue;
        }

        validTrades.push(trade);
        console.log(`✅ Row ${rowNum}: Valid trade added`, { 
          symbol, 
          datetime: datetime.toISOString(), 
          pnl,
          fillIds: `${trade.buy_fill_id || 'none'}/${trade.sell_fill_id || 'none'}`
        });

      } catch (error) {
        console.error(`❌ Row ${rowNum} parsing error:`, error);
        parseErrors.push(`Row ${rowNum}: ${(error as Error).message}`);
      }
    }

    summary.validTrades = validTrades.length;
    summary.parseErrors = parseErrors.length;

    console.log(`📊 Detailed Processing Summary:`);
    console.log(`  - Total CSV rows: ${summary.totalRows}`);
    console.log(`  - Empty rows skipped: ${emptyRowsSkipped}`);
    console.log(`  - Parse errors: ${summary.parseErrors}`);
    console.log(`  - Mock data filtered: ${summary.mockDataFiltered}`);
    console.log(`  - Valid trades: ${summary.validTrades}`);
    console.log(`  - Trades with fill IDs: ${validTrades.filter(t => t.buy_fill_id || t.sell_fill_id).length}`);

    if (parseErrors.length > 0) {
      console.log(`❌ Parse errors details:`, parseErrors.slice(0, 10));
    }

    if (validTrades.length === 0) {
      const errorDetails = parseErrors.length > 0 
        ? `\n\nErrors found:\n${parseErrors.slice(0, 10).join('\n')}`
        : '';
      
      throw new Error(`No valid trades found in your CSV file.${errorDetails}\n\nPlease ensure your CSV contains proper trading data with columns for date/time, symbol, side (BUY/SELL), quantity, price, and P&L.`);
    }

    /* ------------ Step 4: Remove CSV-level duplicates with enhanced logic ------------ */
    setLoadingMessage('Removing CSV duplicates with enhanced detection...');
    
    const { unique: csvUniqueTrades, duplicates: csvDuplicates } = removeCsvDuplicates(validTrades);
    summary.duplicatesSkipped = csvDuplicates.length;

    console.log(`🔄 Enhanced CSV Duplicate Check:`);
    console.log(`  - Original valid trades: ${validTrades.length}`);
    console.log(`  - After removing CSV duplicates: ${csvUniqueTrades.length}`);
    console.log(`  - CSV duplicates removed: ${csvDuplicates.length}`);

    if (csvUniqueTrades.length === 0) {
      // Clear loading state and show graceful message
      setLoadingMessage('');
      setColumnMapping(null);
      setCsvData(null);
      
      toast({
        title: '📋 All CSV Trades are Duplicates',
        description: `All ${validTrades.length} trades in your CSV file are duplicates of each other. This usually means the same data was exported multiple times.`,
        variant: 'default'
      });
      
      setTimeout(() => {
        toast({
          title: 'ℹ️ Duplicate Detection Working Perfectly',
          description: 'Our enhanced duplicate detection prevented importing duplicate trades within your CSV file.',
          variant: 'default'
        });
      }, 2000);
      
      return; // Exit gracefully
    }

    /* ------------ Step 5: Check database duplicates using enhanced flexible approach ------------ */
    setLoadingMessage('Checking database for existing trades with enhanced matching...');
    
    let finalTrades = csvUniqueTrades;
    let databaseDuplicateCount = 0;

    if (csvUniqueTrades.length > 0) {
      try {
        // Prepare trades data for enhanced database duplicate checking
        const tradesForCheck = csvUniqueTrades.map(trade => ({
          datetime: trade.datetime,
          symbol: trade.symbol,
          side: trade.side,
          qty: trade.qty,
          price: trade.price,
          pnl: trade.pnl,
          buy_fill_id: trade.buy_fill_id,
          sell_fill_id: trade.sell_fill_id
        }));

        console.log(`🔍 Sending ${tradesForCheck.length} trades for database duplicate check`);
        console.log(`📋 Sample trade for DB check:`, tradesForCheck[0]);

        // Use the enhanced flexible database function
        const { data: duplicateResults, error: duplicateError } = await supabase
          .rpc('get_duplicate_trades_enhanced', {
            p_journal_id: journal.id,
            p_trades: tradesForCheck
          });

        if (!duplicateError && duplicateResults) {
          console.log(`🔍 Database duplicate check results:`, duplicateResults);
          
          // Filter out duplicates with detailed logging
          finalTrades = csvUniqueTrades.filter((trade, index) => {
            const result = duplicateResults.find(r => r.trade_index === index);
            const isDuplicate = result?.is_duplicate || false;
            
            if (isDuplicate) {
              databaseDuplicateCount++;
              console.log(`📋 Database duplicate found (${result.match_type}):`, {
                symbol: trade.symbol,
                datetime: trade.datetime,
                pnl: trade.pnl,
                buyFillId: trade.buy_fill_id,
                sellFillId: trade.sell_fill_id
              });
            } else {
              console.log(`✅ Database unique trade:`, {
                symbol: trade.symbol,
                datetime: trade.datetime,
                pnl: trade.pnl,
                fillIds: `${trade.buy_fill_id || 'none'}/${trade.sell_fill_id || 'none'}`
              });
            }
            
            return !isDuplicate;
          });

          console.log(`📊 Enhanced Database Duplicate Summary:`);
          console.log(`  - Checked trades: ${csvUniqueTrades.length}`);
          console.log(`  - Database duplicates found: ${databaseDuplicateCount}`);
          console.log(`  - Final unique trades: ${finalTrades.length}`);
        } else {
          console.warn('⚠️ Enhanced database duplicate check failed, using fallback method');
          if (duplicateError) {
            console.error('Database duplicate check error:', duplicateError);
          }
          
          // Fallback: use the simpler database duplicate check
          try {
            const { data: fallbackResults, error: fallbackError } = await supabase
              .rpc('get_duplicate_trades_flexible', {
                p_journal_id: journal.id,
                p_trades: tradesForCheck
              });
              
            if (!fallbackError && fallbackResults) {
              finalTrades = csvUniqueTrades.filter((_, index) => {
                const result = fallbackResults.find(r => r.trade_index === index);
                const isDuplicate = result?.is_duplicate || false;
                if (isDuplicate) databaseDuplicateCount++;
                return !isDuplicate;
              });
              console.log(`📊 Fallback Database Check: ${databaseDuplicateCount} duplicates found`);
            }
          } catch (fallbackErr) {
            console.warn('⚠️ Fallback database check also failed, proceeding with all trades');
          }
        }
      } catch (error) {
        console.warn('⚠️ Database duplicate check failed:', error);
      }
    }

    if (finalTrades.length === 0) {
      const totalDuplicates = summary.duplicatesSkipped + databaseDuplicateCount;
      
      // Clear loading state
      setLoadingMessage('');
      setColumnMapping(null);
      setCsvData(null);
      
      // Show user-friendly toast notification instead of throwing error
      toast({
        title: '📋 All Trades Already Exist in Database',
        description: `No new trades were imported because all ${validTrades.length} trades in your CSV file already exist in this journal. ${summary.duplicatesSkipped} were CSV duplicates, and ${databaseDuplicateCount} already exist in your database.`,
        variant: 'default'
      });
      
      // Show additional helpful message
      setTimeout(() => {
        toast({
          title: 'ℹ️ Enhanced Duplicate Detection Working Perfectly',
          description: 'Our smart duplicate detection system (using fill IDs and composite matching) prevented any duplicate trades from being imported.',
          variant: 'default'
        });
      }, 2000);

      console.log(`📊 Complete Enhanced Duplicate Summary:`, {
        totalCsvRows: summary.totalRows,
        validTrades: validTrades.length,
        csvDuplicates: summary.duplicatesSkipped,
        databaseDuplicates: databaseDuplicateCount,
        finalResult: 'All trades were duplicates - no import needed'
      });

      return; // Exit gracefully without reloading page
    }

    /* ------------ Step 6: Store raw data ------------ */
    setLoadingMessage('Storing raw data...');
    
    const { data: rawData, error: rawError } = await supabase
      .from('raw_trade_data')
      .insert({
        user_id: user.id,
        file_name: fileName,
        headers: csvHeaders,
        data: { 
          mapping: finalMapping, 
          totalRows: csvData.length,
          emptyRowsSkipped,
          validTrades: finalTrades.length,
          parseErrors: parseErrors.length,
          mockDataFiltered: summary.mockDataFiltered,
          csvDuplicates: summary.duplicatesSkipped,
          databaseDuplicates: databaseDuplicateCount,
          tradesWithFillIds: finalTrades.filter(t => t.buy_fill_id || t.sell_fill_id).length,
          enhancedDuplicateDetection: true
        }
      })
      .select()
      .single();
    
    if (rawError) {
      console.error('❌ Raw data storage failed:', rawError);
      throw rawError;
    }

    console.log('✅ Raw data stored with ID:', rawData.id);

    /* ------------ Step 7: Calculate preliminary metrics ------------ */
    const preliminaryMetrics = calculateMetrics(finalTrades as Trade[]);
    console.log('📊 Preliminary metrics:', preliminaryMetrics);

    /* ------------ Step 8: Create session ------------ */
    setLoadingMessage('Creating trade session...');
    
    const { data: newSession, error: sessionError } = await supabase
      .from('trade_sessions')
      .insert({
        journal_id: journal.id,
        user_id: user.id,
        raw_data_id: rawData.id,
        ...preliminaryMetrics
      })
      .select()
      .single();
    
    if (sessionError) {
      console.error('❌ Session creation failed:', sessionError);
      throw sessionError;
    }

    console.log('✅ Session created with ID:', newSession.id);

    /* ------------ Step 9: Insert trades ------------ */
    setLoadingMessage(`Inserting ${finalTrades.length} trades...`);
    
    // Set session_id for all trades
    const tradesWithSession = finalTrades.map(trade => ({
      ...trade,
      session_id: newSession.id
    }));

    let insertedCount = 0;

    if (tradesWithSession.length > 0) {
      try {
        // Use simple insert since we've already handled duplicates
        const { data: insertedTrades, error: insertError } = await supabase
          .from('trades')
          .insert(tradesWithSession)
          .select('id');

        if (insertError) {
          console.error('❌ Insert failed:', insertError);
          throw insertError;
        }

        insertedCount = insertedTrades?.length || 0;

        console.log(`✅ Insert completed:`);
        console.log(`  - Successfully inserted: ${insertedCount}`);

      } catch (error) {
        console.error('❌ Trade insertion failed:', error);
        throw error;
      }
    }

    summary.insertedTrades = insertedCount;
    summary.skippedDuplicates = databaseDuplicateCount;

    /* ------------ Step 10: Update session with actual metrics ------------ */
    if (insertedCount > 0) {
      setLoadingMessage('Calculating final metrics...');
      
      // Get the actually inserted trades for accurate metrics
      const { data: actualTrades, error: actualTradesError } = await supabase
        .from('trades')
        .select('*')
        .eq('session_id', newSession.id);
      
      if (!actualTradesError && actualTrades && actualTrades.length > 0) {
        const actualMetrics = calculateMetrics(actualTrades);
        console.log(`📊 Final metrics based on ${actualTrades.length} actual trades:`, actualMetrics);
        
        const { error: updateError } = await supabase
          .from('trade_sessions')
          .update(actualMetrics)
          .eq('id', newSession.id);
        
        if (updateError) {
          console.error('❌ Session metrics update failed:', updateError);
        } else {
          console.log('✅ Session metrics updated successfully');
        }
      }
    } else {
      console.log('⚠️ No trades were inserted, session will show zero metrics');
    }

    /* ------------ Step 11: Generate AI insights ------------ */
    if (insertedCount > 0) {
      try {
        setLoadingMessage('Generating AI insights...');
        const { data: insights, error: insightsError } = await supabase.functions.invoke<
          Partial<Tables<'trade_sessions'>>
        >('analyze-trades', { body: { trades: tradesWithSession.slice(0, 100) } });
        
        if (!insightsError && insights) {
          await supabase.from('trade_sessions').update(insights).eq('id', newSession.id);
          console.log('✅ AI insights generated successfully');
        }
      } catch (err) {
        console.warn('⚠️ AI insights generation failed:', err);
      }
    }

    /* ------------ Step 12: Show comprehensive results ------------ */
    const totalDuplicates = summary.duplicatesSkipped + summary.skippedDuplicates;
    
    // Enhanced success notification with detailed breakdown
    const skippedBreakdown = [];
    if (summary.parseErrors > 0) skippedBreakdown.push(`${summary.parseErrors} parse errors`);
    if (summary.mockDataFiltered > 0) skippedBreakdown.push(`${summary.mockDataFiltered} mock data`);
    if (totalDuplicates > 0) skippedBreakdown.push(`${totalDuplicates} duplicates`);
    if (emptyRowsSkipped > 0) skippedBreakdown.push(`${emptyRowsSkipped} empty rows`);
    
    const skippedDetails = skippedBreakdown.length > 0 ? ` (Skipped: ${skippedBreakdown.join(', ')})` : '';
    const fillIdInfo = finalTrades.filter(t => t.buy_fill_id || t.sell_fill_id).length > 0 
      ? ` Enhanced duplicate detection used fill IDs for ${finalTrades.filter(t => t.buy_fill_id || t.sell_fill_id).length} trades.` 
      : '';
    
    toast({
      title: '✅ CSV Processing Complete!',
      description: `Successfully imported ${insertedCount} trades from ${summary.totalRows} CSV rows.${skippedDetails}${fillIdInfo}`,
    });

    if (summary.parseErrors > 0) {
      setTimeout(() => {
        toast({
          title: '⚠️ Some Rows Had Issues',
          description: `${summary.parseErrors} rows had formatting issues and were skipped. Check the browser console for details.`,
          variant: 'default'
        });
      }, 2000);
    }

    console.log(`🎯 Final Enhanced Summary:`, {
      ...summary,
      emptyRowsSkipped,
      enhancedDuplicateDetection: true,
      finalAccountingCheck: {
        totalRows: summary.totalRows,
        processed: emptyRowsSkipped + summary.parseErrors + summary.mockDataFiltered + summary.validTrades,
        matches: summary.totalRows === (emptyRowsSkipped + summary.parseErrors + summary.mockDataFiltered + summary.validTrades)
      }
    });

    setLoadingMessage('');
    
    // Clear the mapping state
    setColumnMapping(null);
    setCsvData(null);
    
    // Refresh the page to show the new data
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  // Enhanced fallback mapping function with fill IDs
  const createFallbackMapping = (headers: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    
    const patterns: Record<string, RegExp> = {
      datetime: /^(date|time|timestamp|datetime|execution|trade.*time|bought.*timestamp|sold.*timestamp)$/i,
      symbol: /^(symbol|ticker|instrument|contract)$/i,
      side: /^(side|action|type|direction|buy.*sell)$/i,
      qty: /^(qty|quantity|size|amount|volume|shares|contracts)$/i,
      price: /^(price|exec.*price|execution.*price|fill.*price|avg.*price)$/i,
      buyPrice: /^(buy.*price|entry.*price|open.*price)$/i,
      sellPrice: /^(sell.*price|exit.*price|close.*price)$/i,
      buyFillId: /^(buy.*fill.*id|buy.*order.*id|entry.*fill.*id|open.*fill.*id)$/i,
      sellFillId: /^(sell.*fill.*id|sell.*order.*id|exit.*fill.*id|close.*fill.*id)$/i,
      pnl: /^(p.?l|profit|loss|realized|net.*p.?l|pnl)$/i,
      notes: /^(notes|description|comment|memo)$/i,
      strategy: /^(strategy|setup|plan|method)$/i,
      tags: /^(tags|labels|categories)$/i
    };
    
    for (const header of headers) {
      for (const [key, pattern] of Object.entries(patterns)) {
        if (pattern.test(header)) {
          mapping[key] = header;
          break;
        }
      }
    }
    
    console.log('🗺️ Fallback mapping created:', mapping);
    return mapping;
  };

  return { 
    processCsv, 
    loadingMessage, 
    columnMapping, 
    processCSVWithMapping,
    csvHeaders,
    csvData 
  };
};