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

/** Remove exact duplicates within the CSV file using a simple composite key */
const removeCsvDuplicates = (trades: any[]): { unique: any[], duplicates: any[] } => {
  const seen = new Set<string>();
  const unique: any[] = [];
  const duplicates: any[] = [];
  
  for (const trade of trades) {
    // Create a simple key for CSV-level duplicate detection
    const key = [
      trade.journal_id,
      trade.datetime,
      (trade.symbol || '').toString().toUpperCase().trim(),
      (trade.side || '').toString().toUpperCase().trim(),
      Number(trade.qty || 0).toString(),
      Number(trade.price || 0).toString(),
      Number(trade.pnl || 0).toString()
    ].join('|');
    
    if (seen.has(key)) {
      duplicates.push(trade);
      console.log(`🔍 CSV Duplicate found:`, trade.symbol, trade.datetime, trade.pnl);
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

    console.log(`🚀 Processing CSV: ${file.name} (${file.size} bytes)`);
    setLoadingMessage('Reading and parsing CSV file...');
    
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

          try {
            await processCSVData(results, file.name);
          } catch (error) {
            console.error('❌ Error in processCSVData:', error);
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

  const processCSVData = async (results: Papa.ParseResult<CsvRow>, fileName: string) => {
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

    const getVal = (row: CsvRow, key: string): any => {
      const header = headerMapping[key];
      if (header && row[header] !== undefined) {
        return row[header];
      }
      // Fallback to common column names
      const fallbacks: Record<string, string[]> = {
        datetime: ['Timestamp', 'Time', 'Date', 'DateTime', 'TradeTime', 'Execution Time'],
        symbol: ['Symbol', 'Ticker', 'Instrument', 'Contract'],
        side: ['Side', 'Action', 'Type', 'Direction'],
        qty: ['Qty', 'Quantity', 'Size', 'Amount', 'Volume'],
        price: ['Price', 'ExecPrice', 'ExecutionPrice', 'FillPrice', 'Exec Price'],
        pnl: ['PnL', 'P/L', 'Profit', 'NetPnL', 'RealizedPnL', 'Net PnL', 'Realized P&L']
      };
      
      for (const fallback of fallbacks[key] || []) {
        if (row[fallback] !== undefined) {
          return row[fallback];
        }
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
        // Extract raw values
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

        console.log(`📊 Row ${rowNum}:`, {
          datetime: datetimeRaw,
          symbol: symbolRaw,
          side: sideRaw,
          qty: qtyRaw,
          price: priceRaw,
          pnl: pnlRaw,
          hasData: hasAnyData
        });

        // Parse and validate datetime
        const datetime = validateDateTime(datetimeRaw as string);
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
          session_id: '', // Will be set later
          user_id: user.id,
          journal_id: journal.id
        };

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
        console.log(`✅ Row ${rowNum}: Valid trade`, { symbol, datetime: datetime.toISOString(), pnl });

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
    console.log(`  - Accounting: ${summary.totalRows} = ${emptyRowsSkipped} + ${summary.parseErrors} + ${summary.mockDataFiltered} + ${summary.validTrades}`);

    if (parseErrors.length > 0) {
      console.log(`❌ Parse errors details:`, parseErrors.slice(0, 10));
    }

    if (validTrades.length === 0) {
      const errorDetails = parseErrors.length > 0 
        ? `\n\nErrors found:\n${parseErrors.slice(0, 10).join('\n')}`
        : '';
      
      throw new Error(`No valid trades found in your CSV file.${errorDetails}\n\nPlease ensure your CSV contains proper trading data with columns for date/time, symbol, side (BUY/SELL), quantity, price, and P&L.`);
    }

    /* ------------ Step 4: Remove CSV-level duplicates ------------ */
    setLoadingMessage('Removing CSV duplicates...');
    
    const { unique: csvUniqueTrades, duplicates: csvDuplicates } = removeCsvDuplicates(validTrades);
    summary.duplicatesSkipped = csvDuplicates.length;

    console.log(`🔄 CSV Duplicate Check:`);
    console.log(`  - Original valid trades: ${validTrades.length}`);
    console.log(`  - After removing CSV duplicates: ${csvUniqueTrades.length}`);
    console.log(`  - CSV duplicates removed: ${csvDuplicates.length}`);

    /* ------------ Step 5: Check database duplicates using SQL function ------------ */
    setLoadingMessage('Checking database for existing trades...');
    
    let finalTrades = csvUniqueTrades;
    let databaseDuplicateCount = 0;

    if (csvUniqueTrades.length > 0) {
      try {
        // Prepare trades data for the SQL function
        const tradesForCheck = csvUniqueTrades.map(trade => ({
          datetime: trade.datetime,
          symbol: trade.symbol,
          side: trade.side,
          qty: trade.qty,
          price: trade.price,
          pnl: trade.pnl
        }));

        // Use the database function to check for duplicates
        const { data: duplicateResults, error: duplicateError } = await supabase
          .rpc('get_duplicate_trades', {
            p_journal_id: journal.id,
            p_trades: tradesForCheck
          });

        if (!duplicateError && duplicateResults) {
          console.log(`🔍 Database duplicate check results:`, duplicateResults);
          
          // Filter out duplicates
          finalTrades = csvUniqueTrades.filter((_, index) => {
            const result = duplicateResults.find(r => r.trade_index === index);
            const isDuplicate = result?.is_duplicate || false;
            if (isDuplicate) databaseDuplicateCount++;
            return !isDuplicate;
          });

          console.log(`📊 Database Duplicate Summary:`);
          console.log(`  - Checked trades: ${csvUniqueTrades.length}`);
          console.log(`  - Database duplicates found: ${databaseDuplicateCount}`);
          console.log(`  - Final unique trades: ${finalTrades.length}`);
        } else {
          console.warn('⚠️ Could not check database duplicates, proceeding with all trades');
          if (duplicateError) {
            console.error('Database duplicate check error:', duplicateError);
          }
        }
      } catch (error) {
        console.warn('⚠️ Database duplicate check failed:', error);
      }
    }

    if (finalTrades.length === 0) {
      const totalDuplicates = summary.duplicatesSkipped + databaseDuplicateCount;
      throw new Error(`No new trades to import. All ${validTrades.length} trades are duplicates (${summary.duplicatesSkipped} from CSV, ${databaseDuplicateCount} already in database).`);
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
          mapping: headerMapping, 
          totalRows: csvData.length,
          emptyRowsSkipped,
          validTrades: finalTrades.length,
          parseErrors: parseErrors.length,
          mockDataFiltered: summary.mockDataFiltered,
          csvDuplicates: summary.duplicatesSkipped,
          databaseDuplicates: databaseDuplicateCount
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
        // Simple insert - duplicates should already be filtered out
        const { data: insertedTrades, error: insertError } = await supabase
          .from('trades')
          .insert(tradesWithSession)
          .select('id');

        if (insertError) {
          console.error('❌ Batch insert failed:', insertError);
          // If we still get a constraint error, it means our duplicate detection missed something
          if (insertError.code === '23505' && insertError.message?.includes('idx_trades_unique_composite')) {
            throw new Error('Some trades already exist in the database. Our duplicate detection may have missed a few trades due to minor formatting differences. Please try again or check your data for very similar trades.');
          }
          throw insertError;
        }

        insertedCount = insertedTrades?.length || 0;

        console.log(`✅ Batch insert completed:`);
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
    
    if (insertedCount === 0) {
      // Delete the empty session
      await supabase.from('trade_sessions').delete().eq('id', newSession.id);
      
      throw new Error(`No new trades were inserted. All ${finalTrades.length} trades appear to be duplicates of existing data in your journal.`);
    }
    
    // Enhanced success notification with detailed breakdown
    const skippedBreakdown = [];
    if (summary.parseErrors > 0) skippedBreakdown.push(`${summary.parseErrors} parse errors`);
    if (summary.mockDataFiltered > 0) skippedBreakdown.push(`${summary.mockDataFiltered} mock data`);
    if (totalDuplicates > 0) skippedBreakdown.push(`${totalDuplicates} duplicates`);
    if (emptyRowsSkipped > 0) skippedBreakdown.push(`${emptyRowsSkipped} empty rows`);
    
    const skippedDetails = skippedBreakdown.length > 0 ? ` (Skipped: ${skippedBreakdown.join(', ')})` : '';
    
    toast({
      title: '✅ CSV Processing Complete!',
      description: `Successfully imported ${insertedCount} trades from ${summary.totalRows} CSV rows.${skippedDetails}`,
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

    console.log(`🎯 Final Summary:`, {
      ...summary,
      emptyRowsSkipped,
      finalAccountingCheck: {
        totalRows: summary.totalRows,
        processed: emptyRowsSkipped + summary.parseErrors + summary.mockDataFiltered + summary.validTrades,
        matches: summary.totalRows === (emptyRowsSkipped + summary.parseErrors + summary.mockDataFiltered + summary.validTrades)
      }
    });

    setLoadingMessage('');
    
    // Refresh the page to show the new data
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  // Fallback mapping function
  const createFallbackMapping = (headers: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    
    const patterns = {
      datetime: /^(date|time|timestamp|datetime|execution|trade.*time)$/i,
      symbol: /^(symbol|ticker|instrument|contract)$/i,
      side: /^(side|action|type|direction|buy.*sell)$/i,
      qty: /^(qty|quantity|size|amount|volume|shares|contracts)$/i,
      price: /^(price|exec.*price|execution.*price|fill.*price|avg.*price)$/i,
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
    
    return mapping;
  };

  return { processCsv, loadingMessage };
};