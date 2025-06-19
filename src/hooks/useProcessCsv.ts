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

interface TradeAnalysisSummary {
  totalRows: number;
  duplicatesSkipped: number;
  newEntriesInserted: number;
  fileName: string;
  uploadTimestamp: string;
  parseErrors: number;
  validTrades: number;
  duplicateEntries: Array<{
    datetime: string;
    symbol: string;
    side: string;
    qty: number;
    price: number;
    pnl: number;
  }>;
}

/** Check if data appears to be mock/demo data */
const isMockData = (trade: any): boolean => {
  const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE'];
  const symbol = (trade.symbol || '').toString().toUpperCase().trim();
  
  if (mockSymbols.includes(symbol)) return true;
  if (symbol.includes('TEST') || symbol.includes('DEMO') || symbol.includes('SAMPLE')) return true;
  
  return false;
};

/** Validate trade data with detailed error reporting */
const validateTradeData = (trade: any, rowIndex: number): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!trade.datetime) {
    errors.push(`Row ${rowIndex}: Missing datetime`);
  } else {
    const date = validateDateTime(trade.datetime);
    if (!date) {
      errors.push(`Row ${rowIndex}: Invalid datetime format`);
    }
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

/** Create a unique key for trade based on the database composite constraint */
const createTradeUniqueKey = (trade: any): string => {
  return [
    trade.journal_id,
    trade.datetime,
    (trade.symbol || '').toString().toUpperCase().trim(),
    (trade.side || '').toString().toUpperCase().trim(),
    trade.qty,
    trade.price,
    trade.pnl
  ].join('|');
};

/** Remove duplicate trades based on composite key */
const deduplicateTrades = (trades: any[]): { unique: any[], duplicates: any[] } => {
  const seen = new Set<string>();
  const unique: any[] = [];
  const duplicates: any[] = [];
  
  for (const trade of trades) {
    const key = createTradeUniqueKey(trade);
    if (seen.has(key)) {
      duplicates.push(trade);
    } else {
      seen.add(key);
      unique.push(trade);
    }
  }
  
  return { unique, duplicates };
};

export const useProcessCsv = (journal: Journal) => {
  const { user } = useAuth();
  const [loadingMessage, setLoadingMessage] = useState('');

  const processCsv = async (file: File) => {
    if (!user || !journal.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in and have a journal selected.',
        variant: 'destructive'
      });
      return;
    }

    const uploadTimestamp = new Date().toISOString();
    console.log(`🚀 Starting broker-agnostic CSV processing for file: ${file.name}`);

    setLoadingMessage('Reading CSV file...');
    
    try {
      const text = await file.text();
      console.log(`📄 File size: ${text.length} characters`);

      Papa.parse<CsvRow>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        complete: async (results) => {
          console.log(`📊 CSV parsing complete:`);
          console.log(`  - Total rows: ${results.data.length}`);
          console.log(`  - Headers: ${results.meta?.fields?.join(', ')}`);
          console.log(`  - Parse errors: ${results.errors.length}`);
          
          if (results.errors.length > 0) {
            console.log(`❌ Parse errors:`, results.errors);
          }

          try {
            await processCSVData(results, file.name, uploadTimestamp);
          } catch (error) {
            console.error('❌ Error processing CSV data:', error);
            toast({ 
              title: 'Processing Error', 
              description: (error as Error).message, 
              variant: 'destructive' 
            });
            setLoadingMessage('');
          }
        },
        error: (error) => {
          console.error('❌ CSV parsing error:', error);
          toast({ 
            title: 'CSV Parsing Error', 
            description: error.message, 
            variant: 'destructive' 
          });
          setLoadingMessage('');
        }
      });
    } catch (error) {
      console.error('❌ File reading error:', error);
      toast({ 
        title: 'File Error', 
        description: 'Failed to read the CSV file. Please try again.', 
        variant: 'destructive' 
      });
      setLoadingMessage('');
    }
  };

  const processCSVData = async (results: Papa.ParseResult<CsvRow>, fileName: string, uploadTimestamp: string) => {
    const csvHeaders = results.meta?.fields || [];
    const csvDataSample = results.data.slice(0, 3);

    /* ------------ Validate trading CSV ------------ */
    setLoadingMessage('Validating CSV data...');
    const { data: validationData, error: validationError } = await supabase.functions.invoke<
      { is_trading_related: boolean }
    >('validate-csv-content', { body: { csvHeaders, csvDataSample } });
    
    if (validationError) throw validationError;
    if (!validationData?.is_trading_related) {
      throw new Error('The uploaded CSV does not appear to contain trading data.');
    }

    /* ------------ AI column mapping (Gemini) ------------ */
    setLoadingMessage('Mapping CSV columns...');
    const { data: mappingData, error: mappingError } = await supabase.functions.invoke<
      { mapping: Record<string, string> }
    >('map-columns-with-gemini', { body: { csvHeaders, csvDataSample } });
    
    if (mappingError) throw mappingError;
    const headerMapping = mappingData?.mapping || {};

    console.log('🗺️ Column Mapping:', headerMapping);

    const getVal = (row: CsvRow, key: string) => {
      const header = headerMapping[key];
      return header ? row[header] : undefined;
    };

    /* ------------ Parse and validate trades with broker-agnostic normalization ------------ */
    setLoadingMessage('Processing trade data...');
    const summary: TradeAnalysisSummary = {
      totalRows: results.data.length,
      duplicatesSkipped: 0,
      newEntriesInserted: 0,
      fileName,
      uploadTimestamp,
      parseErrors: 0,
      validTrades: 0,
      duplicateEntries: []
    };

    const validTrades: Array<Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>> = [];
    const allParseErrors: string[] = [];

    console.log(`🔄 Processing ${results.data.length} CSV rows with broker-agnostic normalization...`);

    for (let index = 0; index < results.data.length; index++) {
      const row = results.data[index];
      const rowIndex = index + 1;
      
      try {
        // Extract raw values using the mapping
        const datetimeRaw = getVal(row, 'datetime') || row.Timestamp || row.Time || row.Date;
        const symbolRaw = getVal(row, 'symbol') || row.Symbol || row.Instrument;
        const sideRaw = getVal(row, 'side') || row.Side || row.Action || row.Type || row.Direction;
        const qtyRaw = getVal(row, 'qty') || row.Qty || row.Quantity || row.Size;
        const priceRaw = getVal(row, 'price') || row.Price || row.EntryPrice || row.ExitPrice;
        const buyPriceRaw = getVal(row, 'buyPrice') || row.BuyPrice || row.EntryPrice;
        const sellPriceRaw = getVal(row, 'sellPrice') || row.SellPrice || row.ExitPrice;
        const pnlRaw = getVal(row, 'pnl') || row.PnL || row['P/L'] || row.NetPL || row.Profit || row.Loss || row.profit_loss;
        const notesRaw = getVal(row, 'notes') || row.Notes || row.Comment || '';
        const strategyRaw = getVal(row, 'strategy') || row.Strategy || '';
        const tagsRaw = getVal(row, 'tags') || row.Tags || '';

        console.log(`📊 Row ${rowIndex} raw values:`, {
          datetime: datetimeRaw,
          symbol: symbolRaw,
          side: sideRaw,
          qty: qtyRaw,
          price: priceRaw,
          buyPrice: buyPriceRaw,
          sellPrice: sellPriceRaw,
          pnl: pnlRaw
        });

        // Validate and parse datetime
        const datetime = validateDateTime(datetimeRaw as string);
        if (!datetime) {
          allParseErrors.push(`Row ${rowIndex}: Invalid or missing datetime`);
          continue;
        }

        // Normalize symbol
        const symbol = normalizeSymbol(symbolRaw as string);
        if (!symbol) {
          allParseErrors.push(`Row ${rowIndex}: Invalid or missing symbol`);
          continue;
        }

        // Parse numeric values using broker-agnostic parser
        const qty = parseNumber(qtyRaw);
        const price = parseNumber(priceRaw);
        const buyPrice = parseNumber(buyPriceRaw);
        const sellPrice = parseNumber(sellPriceRaw);
        const pnl = parseNumber(pnlRaw);

        console.log(`📊 Row ${rowIndex} parsed values:`, {
          symbol,
          qty,
          price,
          buyPrice,
          sellPrice,
          pnl
        });

        // Determine the best price to use
        let finalPrice = price;
        if (isNaN(finalPrice) && !isNaN(buyPrice)) finalPrice = buyPrice;
        if (isNaN(finalPrice) && !isNaN(sellPrice)) finalPrice = sellPrice;

        // Infer side using broker-agnostic logic
        const side = inferSide(
          sideRaw as string,
          qty,
          !isNaN(buyPrice) ? buyPrice : undefined,
          !isNaN(sellPrice) ? sellPrice : undefined
        );

        // Build trade object
        const trade = {
          datetime: datetime.toISOString(),
          symbol,
          side,
          qty: Math.abs(qty), // Always store positive quantity
          price: finalPrice,
          pnl,
          notes: notesRaw ? notesRaw.toString().trim() : null,
          strategy: strategyRaw ? strategyRaw.toString().trim() : null,
          tags: parseTags(tagsRaw as string),
          image_url: null
        };

        console.log(`📊 Row ${rowIndex} final trade:`, trade);

        // Validate the normalized trade
        const validation = validateTradeData(trade, rowIndex);
        if (!validation.isValid) {
          allParseErrors.push(...validation.errors);
          continue;
        }

        // Skip mock data
        if (isMockData(trade)) {
          console.warn(`⚠️ Row ${rowIndex}: Detected mock data, skipping`);
          continue;
        }

        validTrades.push(trade);
      } catch (error) {
        console.error(`❌ Error parsing row ${rowIndex}:`, error);
        allParseErrors.push(`Row ${rowIndex}: ${(error as Error).message}`);
      }
    }

    summary.validTrades = validTrades.length;
    summary.parseErrors = allParseErrors.length;

    console.log(`📊 Broker-agnostic processing summary:`);
    console.log(`  - Valid trades: ${summary.validTrades}`);
    console.log(`  - Parse errors: ${summary.parseErrors}`);
    
    if (allParseErrors.length > 0) {
      console.log(`❌ Parse errors:`, allParseErrors.slice(0, 10));
    }

    if (validTrades.length === 0) {
      // Enhanced error message with specific parsing errors
      const firstTenErrors = allParseErrors.slice(0, 10);
      const errorDetails = firstTenErrors.length > 0 
        ? `\n\nSpecific errors found:\n${firstTenErrors.join('\n')}`
        : '';
      
      const additionalErrors = allParseErrors.length > 10 
        ? `\n\n... and ${allParseErrors.length - 10} more errors.`
        : '';

      throw new Error(`No valid trades found. Found ${allParseErrors.length} parsing errors.${errorDetails}${additionalErrors}\n\nPlease check your CSV format and ensure it contains valid trading data with required columns (datetime, symbol, side, quantity, price, P&L).`);
    }

    /* ------------ Clean up existing mock data ------------ */
    setLoadingMessage('Cleaning up existing mock data...');
    try {
      await supabase.rpc('cleanup_mock_data', { user_uuid: user.id });
    } catch (error) {
      console.warn('⚠️ Could not clean up mock data:', error);
    }

    /* ------------ Create trade session ------------ */
    setLoadingMessage('Creating trade session...');
    
    // Store raw data first
    const { data: rawData, error: rawError } = await supabase
      .from('raw_trade_data')
      .insert({
        user_id: user.id,
        file_name: fileName,
        headers: csvHeaders,
        data: { 
          mapping: headerMapping, 
          rows: results.data,
          summary
        }
      })
      .select()
      .single();
    
    if (rawError) throw rawError;

    // Calculate metrics
    const metrics = calculateMetrics(validTrades as Trade[]);
    console.log('📊 Calculated metrics:', metrics);

    // Create session
    const { data: newSession, error: sessionError } = await supabase
      .from('trade_sessions')
      .insert({
        journal_id: journal.id,
        user_id: user.id,
        raw_data_id: rawData.id,
        ...metrics
      })
      .select()
      .single();
    
    if (sessionError) throw sessionError;

    /* ------------ Prepare trades data and perform client-side de-duplication ------------ */
    setLoadingMessage('Preparing trades data...');
    
    const tradesData = validTrades.map((t) => ({
      ...t,
      session_id: newSession.id,
      user_id: user.id,
      journal_id: journal.id
    }));

    // Perform client-side de-duplication
    const { unique: uniqueTrades, duplicates: duplicateTrades } = deduplicateTrades(tradesData);
    
    console.log(`🔄 De-duplication results:`);
    console.log(`  - Original trades: ${tradesData.length}`);
    console.log(`  - Unique trades: ${uniqueTrades.length}`);
    console.log(`  - Duplicates found: ${duplicateTrades.length}`);

    // Update summary with duplicate information
    summary.duplicatesSkipped = duplicateTrades.length;
    summary.duplicateEntries = duplicateTrades.map(trade => ({
      datetime: trade.datetime,
      symbol: trade.symbol || '',
      side: trade.side || '',
      qty: trade.qty || 0,
      price: trade.price || 0,
      pnl: trade.pnl || 0
    }));

    /* ------------ Insert unique trades with proper duplicate handling ------------ */
    setLoadingMessage(`Inserting ${uniqueTrades.length} unique trades...`);
    
    if (uniqueTrades.length === 0) {
      console.log('⚠️ No unique trades to insert after de-duplication');
      summary.newEntriesInserted = 0;
    } else {
      const batchSize = 100;
      let totalInsertedCount = 0;
      let totalSkippedCount = 0;

      for (let i = 0; i < uniqueTrades.length; i += batchSize) {
        const batch = uniqueTrades.slice(i, i + batchSize);
        
        try {
          // Use regular insert and handle duplicate key errors gracefully
          const { data: insertedData, error: batchError } = await supabase
            .from('trades')
            .insert(batch)
            .select('id');

          if (batchError) {
            // Check if it's a duplicate key error (constraint violation)
            if (batchError.code === '23505') {
              console.log(`🔄 Batch ${i}-${i + batchSize}: Detected duplicate key constraint violation, skipping duplicates`);
              totalSkippedCount += batch.length;
            } else {
              console.error(`❌ Error inserting batch ${i}-${i + batchSize}:`, batchError);
              throw batchError;
            }
          } else {
            const insertedCount = insertedData?.length || 0;
            totalInsertedCount += insertedCount;
            console.log(`✅ Processed batch ${i}-${i + batchSize}: ${insertedCount} new trades inserted`);
          }
        } catch (error) {
          console.error(`❌ Error inserting batch ${i}-${i + batchSize}:`, error);
          throw error;
        }
      }

      summary.newEntriesInserted = totalInsertedCount;
      summary.duplicatesSkipped += totalSkippedCount; // Add database duplicates to the file duplicates

      console.log(`📊 Successfully inserted ${totalInsertedCount} new trades`);
      console.log(`📊 Total duplicates skipped: ${summary.duplicatesSkipped} (${duplicateTrades.length} from file + ${totalSkippedCount} from database)`);
    }

    /* ------------ Generate AI insights (optional) ------------ */
    try {
      setLoadingMessage('Generating AI insights...');
      const { data: insights, error: insightsError } = await supabase.functions.invoke<
        Partial<Tables<'trade_sessions'>>
      >('analyze-trades', { body: { trades: uniqueTrades.slice(0, 100) } });
      
      if (!insightsError && insights) {
        await supabase.from('trade_sessions').update(insights).eq('id', newSession.id);
      }
    } catch (err) {
      console.warn('⚠️ AI insights failed:', err);
    }

    /* ------------ Show enhanced success notification with duplicate info ------------ */
    if (summary.duplicatesSkipped > 0) {
      toast({
        title: '✅ Upload Complete with Duplicates Handled',
        description: `${summary.newEntriesInserted} new trades added. ${summary.duplicatesSkipped} duplicates were automatically skipped to prevent data conflicts.`,
      });

      // Show detailed duplicate information in a separate toast
      setTimeout(() => {
        toast({
          title: '📋 Duplicate Detection Report',
          description: `Found ${summary.duplicatesSkipped} duplicate trades from previous uploads. These were safely ignored. Your data integrity is maintained.`,
          variant: 'default'
        });
      }, 2000);
    } else {
      toast({
        title: '✅ Upload Complete!',
        description: `Successfully processed ${summary.newEntriesInserted} trades with no duplicates detected.`
      });
    }

    if (summary.parseErrors > 0) {
      setTimeout(() => {
        toast({
          title: '⚠️ Some Rows Skipped',
          description: `${summary.parseErrors} rows had parsing errors and were skipped. Check the console for details.`,
          variant: 'default'
        });
      }, 3000);
    }

    setLoadingMessage('');
    window.location.reload();
  };

  return { processCsv, loadingMessage };
};