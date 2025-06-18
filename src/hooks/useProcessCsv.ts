import { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/components/AuthProvider';
import { calculateMetrics } from '@/lib/trade-metrics';

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

/** Enhanced robust float parser handling all broker negative value formats and international number formats */
const safeParseFloat = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    let cleanValue = value.trim();
    
    if (!cleanValue || cleanValue === '' || cleanValue === 'null' || cleanValue === 'undefined') {
      return 0;
    }

    console.log(`🔍 Parsing value: "${value}" -> cleaned: "${cleanValue}"`);

    let isNegative = false;

    // Handle parentheses formats: (500), ($500), (500.00), etc.
    const parenthesesPatterns = [
      /^\s*\(\s*\$?([0-9,.-]+)\s*\)\s*$/,
      /^\s*\(\s*([0-9,.-]+)\s*\)\s*$/,
      /^\s*\$\s*\(\s*([0-9,.-]+)\s*\)\s*$/,
    ];

    for (const pattern of parenthesesPatterns) {
      const match = cleanValue.match(pattern);
      if (match) {
        isNegative = true;
        cleanValue = match[1];
        console.log(`💰 Found parentheses format: "${value}" -> negative: ${cleanValue}`);
        break;
      }
    }

    // Check for trailing minus: 500-, $500-, 500.00-
    if (!isNegative && cleanValue.match(/.*-\s*$/)) {
      isNegative = true;
      cleanValue = cleanValue.replace(/-\s*$/, '');
      console.log(`➖ Found trailing minus: "${value}" -> negative: ${cleanValue}`);
    }

    // Check for leading minus
    if (!isNegative && cleanValue.startsWith('-')) {
      isNegative = true;
      cleanValue = cleanValue.slice(1);
      console.log(`⬅️ Found leading minus: "${value}" -> negative: ${cleanValue}`);
    }

    // Remove currency symbols and spaces first, but keep numbers, commas, and periods
    cleanValue = cleanValue.replace(/[$%\s€£¥₹¢₨₩₪₫₡₦₨₱₽₪₴₸₼₿]+/g, '');
    
    // Now handle international number formats intelligently
    const commaCount = (cleanValue.match(/,/g) || []).length;
    const periodCount = (cleanValue.match(/\./g) || []).length;
    
    if (commaCount === 0 && periodCount <= 1) {
      // Simple case: no commas, at most one period (e.g., "123.45" or "123")
      cleanValue = cleanValue.replace(/[^0-9.]/g, '');
    } else if (commaCount > 0 && periodCount === 0) {
      // Only commas present
      const lastCommaIndex = cleanValue.lastIndexOf(',');
      const afterLastComma = cleanValue.substring(lastCommaIndex + 1);
      
      if (afterLastComma.length <= 3 && /^\d+$/.test(afterLastComma)) {
        // Likely decimal separator (e.g., "123,45" or "1234,56")
        cleanValue = cleanValue.replace(',', '.').replace(/[^0-9.]/g, '');
        console.log(`🌍 Detected comma as decimal separator: "${value}" -> "${cleanValue}"`);
      } else {
        // Likely thousands separators (e.g., "1,234,567")
        cleanValue = cleanValue.replace(/,/g, '').replace(/[^0-9]/g, '');
        console.log(`🌍 Detected commas as thousands separators: "${value}" -> "${cleanValue}"`);
      }
    } else if (commaCount > 0 && periodCount > 0) {
      // Both commas and periods present
      const lastCommaIndex = cleanValue.lastIndexOf(',');
      const lastPeriodIndex = cleanValue.lastIndexOf('.');
      
      if (lastCommaIndex > lastPeriodIndex) {
        // Comma comes after period, comma is decimal separator (e.g., "1.234,56")
        const beforeDecimal = cleanValue.substring(0, lastCommaIndex).replace(/[^0-9]/g, '');
        const afterDecimal = cleanValue.substring(lastCommaIndex + 1).replace(/[^0-9]/g, '');
        cleanValue = beforeDecimal + '.' + afterDecimal;
        console.log(`🌍 Detected European format (period=thousands, comma=decimal): "${value}" -> "${cleanValue}"`);
      } else {
        // Period comes after comma, period is decimal separator (e.g., "1,234.56")
        const beforeDecimal = cleanValue.substring(0, lastPeriodIndex).replace(/[^0-9]/g, '');
        const afterDecimal = cleanValue.substring(lastPeriodIndex + 1).replace(/[^0-9]/g, '');
        cleanValue = beforeDecimal + '.' + afterDecimal;
        console.log(`🌍 Detected US format (comma=thousands, period=decimal): "${value}" -> "${cleanValue}"`);
      }
    } else {
      // Multiple periods, no commas - remove all but last period
      const lastPeriodIndex = cleanValue.lastIndexOf('.');
      if (lastPeriodIndex !== -1) {
        const beforeDot = cleanValue.substring(0, lastPeriodIndex).replace(/[^0-9]/g, '');
        const afterDot = cleanValue.substring(lastPeriodIndex + 1).replace(/[^0-9]/g, '');
        cleanValue = beforeDot + '.' + afterDot;
      } else {
        cleanValue = cleanValue.replace(/[^0-9]/g, '');
      }
    }

    if (cleanValue === '.' || cleanValue === '') {
      return 0;
    }

    const parsed = parseFloat(cleanValue);
    const result = isNaN(parsed) ? 0 : parsed;
    const finalValue = isNegative ? -Math.abs(result) : result;
    
    if (isNegative || Math.abs(result) > 0) {
      console.log(`✅ Final parsed value: "${value}" -> ${finalValue} (negative: ${isNegative})`);
    }
    
    return finalValue;
  }
  return 0;
};

/** Check if data appears to be mock/demo data */
const isMockData = (trade: any): boolean => {
  const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE'];
  const symbol = (trade.symbol || '').toString().toUpperCase().trim();
  
  if (mockSymbols.includes(symbol)) return true;
  if (symbol.includes('TEST') || symbol.includes('DEMO') || symbol.includes('SAMPLE')) return true;
  
  return false;
};

/** Validate trade data */
const validateTradeData = (trade: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!trade.datetime) {
    errors.push('Missing datetime');
  } else {
    const date = new Date(trade.datetime);
    if (isNaN(date.getTime())) {
      errors.push('Invalid datetime format');
    } else if (date > new Date()) {
      errors.push('Datetime is in the future');
    } else if (date < new Date('2000-01-01')) {
      errors.push('Datetime is too far in the past');
    }
  }
  
  if (!trade.symbol || trade.symbol.toString().trim().length === 0) {
    errors.push('Missing or empty symbol');
  }
  
  if (!trade.side || !['BUY', 'SELL', 'LONG', 'SHORT', 'buy', 'sell', 'long', 'short'].includes(trade.side.toString().toUpperCase())) {
    errors.push('Invalid or missing side');
  }
  
  if (!trade.qty || safeParseFloat(trade.qty) <= 0) {
    errors.push('Invalid quantity (must be positive)');
  }
  
  if (!trade.price || safeParseFloat(trade.price) <= 0) {
    errors.push('Invalid price (must be positive)');
  }
  
  if (trade.pnl === undefined || trade.pnl === null) {
    errors.push('Missing P&L value');
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
    console.log(`🚀 Starting CSV processing for file: ${file.name}`);

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

    /* ------------ Parse and validate trades ------------ */
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
    const parseErrors: string[] = [];

    console.log(`🔄 Processing ${results.data.length} CSV rows...`);

    for (let index = 0; index < results.data.length; index++) {
      const row = results.data[index];
      
      try {
        const datetimeVal = getVal(row, 'datetime') || row.Timestamp || row.Time || row.Date;
        const rawPnlValue = getVal(row, 'pnl') || row.PnL || row['P/L'] || row.NetPL || row.Profit || row.Loss || row.profit_loss;

        if (!datetimeVal) {
          parseErrors.push(`Row ${index + 1}: Missing datetime`);
          continue;
        }

        const trade = {
          datetime: new Date(datetimeVal as string).toISOString(),
          symbol: (getVal(row, 'symbol') || row.Symbol || row.Instrument)?.toString().trim().toUpperCase() || null,
          side: (getVal(row, 'side') || row.Side || row.Action || row.Type)?.toString().trim().toUpperCase() || null,
          qty: safeParseFloat(getVal(row, 'qty') || row.Qty || row.Quantity || row.Size),
          price: safeParseFloat(getVal(row, 'price') || row.Price || row.EntryPrice || row.ExitPrice),
          pnl: safeParseFloat(rawPnlValue),
          notes: ((getVal(row, 'notes') || row.Notes || row.Comment || '') as string).trim() || null,
          strategy: ((getVal(row, 'strategy') || row.Strategy || '') as string).trim() || null,
          tags: null,
          image_url: null
        };

        console.log(`📊 Row ${index + 1} parsed:`, {
          symbol: trade.symbol,
          side: trade.side,
          qty: trade.qty,
          price: trade.price,
          pnl: trade.pnl,
          rawPnl: rawPnlValue
        });

        // Validate trade data
        const validation = validateTradeData(trade);
        if (!validation.isValid) {
          parseErrors.push(`Row ${index + 1}: ${validation.errors.join(', ')}`);
          continue;
        }

        // Skip mock data
        if (isMockData(trade)) {
          console.warn(`⚠️ Row ${index + 1}: Detected mock data, skipping`);
          continue;
        }

        validTrades.push(trade);
      } catch (error) {
        console.error(`❌ Error parsing row ${index + 1}:`, error);
        parseErrors.push(`Row ${index + 1}: ${(error as Error).message}`);
      }
    }

    summary.validTrades = validTrades.length;
    summary.parseErrors = parseErrors.length;

    console.log(`📊 Processing summary:`);
    console.log(`  - Valid trades: ${summary.validTrades}`);
    console.log(`  - Parse errors: ${summary.parseErrors}`);
    
    if (parseErrors.length > 0) {
      console.log(`❌ Parse errors:`, parseErrors.slice(0, 10)); // Log first 10 errors
    }

    if (validTrades.length === 0) {
      throw new Error(`No valid trades found. Found ${parseErrors.length} parsing errors. Please check your CSV format.`);
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
    
    // Use a single transaction for all inserts
    const tradesData = validTrades.map((t) => ({
      ...t,
      session_id: newSession.id,
      user_id: user.id,
      journal_id: journal.id
    }));

    let insertedCount = 0;
    let duplicateCount = 0;
    const batchSize = 100; // Process in batches for better performance

    for (let i = 0; i < tradesData.length; i += batchSize) {
      const batch = tradesData.slice(i, i + batchSize);
      
      try {
        const { data: insertedTrades, error: batchError } = await supabase
          .from('trades')
          .insert(batch)
          .select('id');

        if (batchError) {
          // If batch insert fails due to duplicates, try individual inserts
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
      ? `Successfully inserted ${summary.newEntriesInserted} new trades. ${summary.duplicatesSkipped} duplicates were skipped.`
      : `Successfully inserted ${summary.newEntriesInserted} trades.`;

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