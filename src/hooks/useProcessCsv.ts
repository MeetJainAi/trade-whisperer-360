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

    /* ------------ Insert trades with proper transaction handling ------------ */
    setLoadingMessage(`Inserting ${validTrades.length} trades...`);
    
    const tradesData = validTrades.map((t) => ({
      ...t,
      session_id: newSession.id,
      user_id: user.id,
      journal_id: journal.id
    }));

    let insertedCount = 0;
    let duplicateCount = 0;
    const batchSize = 100;

    for (let i = 0; i < tradesData.length; i += batchSize) {
      const batch = tradesData.slice(i, i + batchSize);
      
      try {
        const { data: insertedTrades, error: batchError } = await supabase
          .from('trades')
          .insert(batch)
          .select('id');

        if (batchError) {
          if (batchError.message.includes('duplicate') || batchError.message.includes('unique')) {
            console.log(`⚠️ Batch insert failed due to duplicates, trying individual inserts...`);
            
            for (const trade of batch) {
              try {
                const { error: singleError } = await supabase.from('trades').insert(trade);
                if (singleError) {
                  if (singleError.message.includes('duplicate') || singleError.message.includes('unique')) {
                    duplicateCount++;
                    summary.duplicateEntries.push({
                      datetime: trade.datetime,
                      symbol: trade.symbol || '',
                      side: trade.side || '',
                      qty: trade.qty || 0,
                      price: trade.price || 0,
                      pnl: trade.pnl || 0
                    });
                  } else {
                    throw singleError;
                  }
                } else {
                  insertedCount++;
                }
              } catch (error) {
                console.error('❌ Error inserting individual trade:', error);
                throw error;
              }
            }
          } else {
            throw batchError;
          }
        } else {
          insertedCount += insertedTrades?.length || 0;
        }
      } catch (error) {
        console.error(`❌ Error inserting batch ${i}-${i + batchSize}:`, error);
        throw error;
      }
    }

    summary.newEntriesInserted = insertedCount;
    summary.duplicatesSkipped = duplicateCount;

    console.log(`📊 Insert results: ${insertedCount} inserted, ${duplicateCount} duplicates skipped`);

    /* ------------ Generate AI insights (optional) ------------ */
    try {
      setLoadingMessage('Generating AI insights...');
      const { data: insights, error: insightsError } = await supabase.functions.invoke<
        Partial<Tables<'trade_sessions'>>
      >('analyze-trades', { body: { trades: tradesData.slice(0, 100) } });
      
      if (!insightsError && insights) {
        await supabase.from('trade_sessions').update(insights).eq('id', newSession.id);
      }
    } catch (err) {
      console.warn('⚠️ AI insights failed:', err);
    }

    /* ------------ Show success notification ------------ */
    const successMessage = summary.duplicatesSkipped > 0
      ? `Successfully processed ${summary.newEntriesInserted} new trades. ${summary.duplicatesSkipped} duplicates were skipped.`
      : `Successfully processed ${summary.newEntriesInserted} trades.`;

    toast({
      title: 'Upload Complete!',
      description: successMessage
    });

    if (summary.parseErrors > 0) {
      setTimeout(() => {
        toast({
          title: 'Some Rows Skipped',
          description: `${summary.parseErrors} rows had parsing errors and were skipped. Check the console for details.`,
          variant: 'default'
        });
      }, 2000);
    }

    if (summary.duplicatesSkipped > 0) {
      setTimeout(() => {
        toast({
          title: 'Duplicate Trades Found',
          description: `${summary.duplicatesSkipped} duplicate trades were identified and skipped to prevent data duplication.`,
          variant: 'default'
        });
      }, 4000);
    }

    setLoadingMessage('');
    window.location.reload();
  };

  return { processCsv, loadingMessage };
};