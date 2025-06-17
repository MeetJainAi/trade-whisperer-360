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

// Enhanced trade analysis summary
interface TradeAnalysisSummary {
  totalRows: number;
  duplicatesSkipped: number;
  newEntriesInserted: number;
  fileName: string;
  uploadTimestamp: string;
  duplicateEntries: Array<{
    datetime: string;
    symbol: string;
    side: string;
    qty: number;
    price: number;
    pnl: number;
  }>;
}

/** Enhanced robust float parser handling all broker negative value formats */
const safeParseFloat = (value: unknown): number => {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    let cleanValue = value.trim();
    
    // Handle empty or invalid strings
    if (!cleanValue || cleanValue === '' || cleanValue === 'null' || cleanValue === 'undefined' || cleanValue === 'NaN') {
      return 0;
    }

    console.log(`🔍 Parsing value: "${value}" -> cleaned: "${cleanValue}"`);

    let isNegative = false;

    // Handle various negative formats more comprehensively
    const negativePatterns = [
      // Parentheses formats: (500), ($500), (500.00), $(500), etc.
      /^\s*\$?\s*\(\s*\$?([0-9,.\s]+)\s*\)\s*$/,
      // Trailing minus: 500-, $500-, 500.00-
      /^\s*\$?\s*([0-9,.\s]+)\s*-\s*$/,
      // Leading minus with currency: -$500, -500
      /^\s*-\s*\$?\s*([0-9,.\s]+)\s*$/,
    ];

    for (const pattern of negativePatterns) {
      const match = cleanValue.match(pattern);
      if (match) {
        isNegative = true;
        cleanValue = match[1];
        console.log(`💰 Found negative format: "${value}" -> extracted: ${cleanValue}`);
        break;
      }
    }

    // Remove all currency symbols, commas, spaces, and other non-numeric characters
    // Keep only digits, dots, and handle multiple currencies
    cleanValue = cleanValue.replace(/[$,%\s€£¥₹¢₨₩₪₫₡₦₨₱₽₪₴₸₼₿\u00A0\u2000-\u200B\u2028\u2029\uFEFF]+/g, '');
    
    // Remove any remaining non-numeric characters except dots and hyphens
    cleanValue = cleanValue.replace(/[^0-9.-]/g, '');
    
    // Handle multiple dots - keep only the first one as decimal separator
    const dotCount = (cleanValue.match(/\./g) || []).length;
    if (dotCount > 1) {
      const dotIndex = cleanValue.indexOf('.');
      const beforeDot = cleanValue.substring(0, dotIndex);
      const afterDot = cleanValue.substring(dotIndex + 1).replace(/\./g, '');
      cleanValue = beforeDot + '.' + afterDot;
    }

    // Handle edge cases
    if (cleanValue === '.' || cleanValue === '' || cleanValue === '-') {
      return 0;
    }

    // Handle scientific notation
    if (cleanValue.toLowerCase().includes('e')) {
      try {
        const parsed = parseFloat(cleanValue);
        return isNaN(parsed) ? 0 : (isNegative ? -Math.abs(parsed) : parsed);
      } catch (error) {
        console.warn(`Failed to parse scientific notation: ${cleanValue}`);
        return 0;
      }
    }

    const parsed = parseFloat(cleanValue);
    
    if (isNaN(parsed)) {
      console.warn(`Failed to parse number: "${value}" -> "${cleanValue}"`);
      return 0;
    }
    
    const result = isNegative ? -Math.abs(parsed) : parsed;
    
    if (Math.abs(result) > 0) {
      console.log(`✅ Final parsed value: "${value}" -> ${result} (negative: ${isNegative})`);
    }
    
    return result;
  }
  return 0;
};

/** Enhanced composite key for deduplication with better normalization */
const createCompositeKey = (
  trade: Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>
): string => {
  try {
    // Normalize datetime to epoch milliseconds for consistent comparison
    const epochTime = new Date(trade.datetime).getTime();
    
    if (isNaN(epochTime)) {
      console.warn('Invalid datetime for composite key:', trade.datetime);
      return '';
    }
    
    // Normalize symbol and side to uppercase and trim whitespace
    const symbol = (trade.symbol || '').toString().toUpperCase().trim();
    const side = (trade.side || '').toString().toUpperCase().trim();

    // Format numbers to fixed decimal places for consistent comparison
    const formatNumber = (n: number | null | undefined) => {
      if (n === null || n === undefined || isNaN(n)) return '0';
      return Number(n).toFixed(4); // Reduced precision to avoid floating point issues
    };

    const qty = formatNumber(trade.qty);
    const price = formatNumber(trade.price);
    const pnl = formatNumber(trade.pnl);

    const key = `${epochTime}|${symbol}|${side}|${qty}|${price}|${pnl}`;
    return key;
  } catch (error) {
    console.error('Error creating composite key:', error, trade);
    return '';
  }
};

/** Check if data appears to be mock/demo data */
const isMockData = (trade: any): boolean => {
  const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE'];
  const symbol = (trade.symbol || '').toString().toUpperCase().trim();
  
  // Check for mock symbols
  if (mockSymbols.includes(symbol)) {
    console.log(`🚫 Filtered out mock symbol: ${symbol}`);
    return true;
  }
  
  // Check for obvious test data patterns
  if (symbol.includes('TEST') || symbol.includes('DEMO') || symbol.includes('SAMPLE')) {
    console.log(`🚫 Filtered out test symbol: ${symbol}`);
    return true;
  }
  
  return false;
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
    console.log(`🚀 Starting CSV upload for file: ${file.name} at ${uploadTimestamp}`);

    setLoadingMessage('Parsing CSV file...');
    
    try {
      const text = await file.text();
      console.log(`📄 CSV file content (first 500 chars): ${text.substring(0, 500)}`);

      Papa.parse<CsvRow>(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            console.log(`📊 Papa Parse Results:`, {
              totalRows: results.data.length,
              headers: results.meta?.fields,
              errors: results.errors,
              firstRow: results.data[0]
            });

            if (results.errors.length) {
              throw new Error(
                `CSV parsing error on row ${results.errors[0].row}: ${results.errors[0].message}`
              );
            }

            const csvHeaders = results.meta?.fields || [];
            const csvDataSample = results.data.slice(0, 3);
            let headerMapping: Record<string, string> = {};

            console.log('📊 CSV Headers:', csvHeaders);
            console.log('📊 Sample Data:', csvDataSample);

            /* ------------ Validate trading CSV ------------ */
            setLoadingMessage('Validating CSV data...');
            try {
              const { data: validationData, error: validationError } = await supabase.functions.invoke<
                { is_trading_related: boolean }
              >('validate-csv-content', { body: { csvHeaders, csvDataSample } });
              if (validationError) throw validationError;
              if (!validationData?.is_trading_related) {
                throw new Error('The uploaded CSV does not appear to contain trading data.');
              }
            } catch (error) {
              console.error('CSV validation failed:', error);
              throw new Error('Failed to validate CSV content. Please ensure it contains trading data.');
            }

            /* ------------ AI column mapping (Gemini) ------------ */
            setLoadingMessage('Mapping CSV columns...');
            try {
              const { data: mappingData, error: mappingError } = await supabase.functions.invoke<
                { mapping: Record<string, string> }
              >('map-columns-with-gemini', { body: { csvHeaders, csvDataSample } });
              if (mappingError) throw mappingError;
              headerMapping = mappingData?.mapping || {};
            } catch (error) {
              console.error('Column mapping failed:', error);
              // Continue with fallback mapping
              headerMapping = {};
            }

            console.log('🗺️ Column Mapping:', headerMapping);

            // Helper function to get value from row using mapping or fallback
            const getVal = (row: CsvRow, key: string) => {
              // First try the mapped header
              const mappedHeader = headerMapping[key];
              if (mappedHeader && row[mappedHeader] !== undefined) {
                return row[mappedHeader];
              }
              
              // Fallback to common header variations
              const fallbacks: Record<string, string[]> = {
                'datetime': ['Timestamp', 'Time', 'Date', 'DateTime', 'Trade Time'],
                'symbol': ['Symbol', 'Instrument', 'Ticker'],
                'side': ['Side', 'Action', 'Type', 'Transaction Type'],
                'qty': ['Qty', 'Quantity', 'Size', 'Amount'],
                'price': ['Price', 'Exec Price', 'Execution Price', 'Entry Price', 'Exit Price'],
                'pnl': ['PnL', 'P/L', 'NetPL', 'Net PnL', 'Profit', 'Loss', 'profit_loss', 'Realized PnL'],
                'notes': ['Notes', 'Comment', 'Description']
              };
              
              const variations = fallbacks[key] || [];
              for (const variation of variations) {
                if (row[variation] !== undefined) {
                  console.log(`🔄 Using fallback header "${variation}" for "${key}"`);
                  return row[variation];
                }
              }
              
              return undefined;
            };

            /* ------------ Parse & deduplicate in-memory ------------ */
            setLoadingMessage('Processing trade data...');
            const parsedTrades: Array<Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>> = [];

            console.log(`🔄 Processing ${results.data.length} rows...`);

            results.data.forEach((row, index) => {
              console.log(`\n📝 Processing Row ${index + 1}:`, row);
              
              try {
                const datetimeVal = getVal(row, 'datetime');
                console.log(`📅 Row ${index + 1} - datetime value: "${datetimeVal}"`);
                
                if (!datetimeVal) {
                  console.warn(`❌ Row ${index + 1}: Missing datetime value, skipping`);
                  return;
                }

                // Get the raw P&L value BEFORE parsing
                const rawPnlValue = getVal(row, 'pnl');
                console.log(`💰 Row ${index + 1} - Raw P&L value: "${rawPnlValue}"`);

                const symbolValue = getVal(row, 'symbol');
                const sideValue = getVal(row, 'side');
                const qtyValue = getVal(row, 'qty');
                const priceValue = getVal(row, 'price');

                console.log(`📊 Row ${index + 1} - Raw values:`, {
                  symbol: symbolValue,
                  side: sideValue,
                  qty: qtyValue,
                  price: priceValue,
                  pnl: rawPnlValue
                });

                const trade = {
                  datetime: new Date(datetimeVal as string).toISOString(),
                  symbol: symbolValue?.toString().trim().toUpperCase() || null,
                  side: sideValue?.toString().trim().toUpperCase() || null,
                  qty: safeParseFloat(qtyValue),
                  price: safeParseFloat(priceValue),
                  pnl: safeParseFloat(rawPnlValue),
                  notes: ((getVal(row, 'notes') || '') as string).trim() || null
                };

                console.log(`✅ Row ${index + 1} - Parsed trade:`, trade);

                // Check if it's mock data
                if (isMockData(trade)) {
                  console.warn(`🚫 Row ${index + 1}: Detected mock data, skipping`);
                  return;
                }

                // Skip rows with no meaningful data
                if (!trade.symbol) {
                  console.warn(`❌ Row ${index + 1}: No symbol, skipping`);
                  return;
                }

                if (trade.pnl === 0 && trade.qty === 0 && trade.price === 0) {
                  console.warn(`❌ Row ${index + 1}: All zero values, skipping`);
                  return;
                }

                console.log(`✅ Row ${index + 1}: Added to parsedTrades`);
                parsedTrades.push(trade);
              } catch (error) {
                console.error(`❌ Error parsing row ${index + 1}:`, error);
              }
            });

            console.log(`\n📊 Parsing Summary: ${parsedTrades.length} trades parsed from ${results.data.length} rows`);

            /* ------------ Check parsed P&L values ------------ */
            const positiveCount = parsedTrades.filter(t => (t.pnl || 0) > 0).length;
            const negativeCount = parsedTrades.filter(t => (t.pnl || 0) < 0).length;
            const zeroCount = parsedTrades.filter(t => (t.pnl || 0) === 0).length;

            console.log(`📊 P&L Summary: ${positiveCount} positive, ${negativeCount} negative, ${zeroCount} zero`);

            if (negativeCount === 0 && positiveCount > 10) {
              console.warn('⚠️ WARNING: No negative P&L values found! This suggests parsing issues.');
              console.log('📋 Sample parsed trades:', parsedTrades.slice(0, 5).map(t => ({ pnl: t.pnl, symbol: t.symbol })));
            }

            /* ------------ Remove duplicates in parsed data ------------ */
            const uniqueTrades: Record<string, typeof parsedTrades[0]> = {};
            const internalDuplicates: typeof parsedTrades = [];

            parsedTrades.forEach((trade, index) => {
              const key = createCompositeKey(trade);
              if (!key) {
                console.warn(`⚠️ Empty key for trade ${index + 1}, skipping`);
                return;
              }
              
              console.log(`🔑 Trade ${index + 1} key: ${key}`);
              
              if (uniqueTrades[key]) {
                console.log(`🔄 Internal duplicate found: ${key}`);
                internalDuplicates.push(trade);
              } else {
                uniqueTrades[key] = trade;
              }
            });

            const tradesToProcess = Object.values(uniqueTrades);
            const totalParsedRows = parsedTrades.length;
            
            if (!tradesToProcess.length) {
              throw new Error('No valid trades found. Check your CSV format and ensure it contains trading data.');
            }

            console.log(`📊 Internal deduplication: ${totalParsedRows} rows, ${tradesToProcess.length} unique trades, ${internalDuplicates.length} internal duplicates`);

            /* ------------ Remove existing mock/demo data from database ------------ */
            setLoadingMessage('Removing mock data...');
            const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE'];
            await supabase
              .from('trades')
              .delete()
              .eq('journal_id', journal.id)
              .in('symbol', mockSymbols);

            /* ------------ Fetch existing trades for duplicate check ------------ */
            setLoadingMessage('Checking for duplicate trades...');
            const existingTrades: Array<{
              datetime: string;
              symbol: string | null;
              side: string | null;
              qty: number | null;
              price: number | null;
              pnl: number | null;
            }> = [];

            const pageSize = 1000;
            for (let from = 0; ; from += pageSize) {
              const { data, error } = await supabase
                .from('trades')
                .select('datetime, symbol, side, qty, price, pnl')
                .eq('journal_id', journal.id)
                .range(from, from + pageSize - 1);
              
              if (error) throw error;
              if (!data?.length) break;
              
              existingTrades.push(...data);
              if (data.length < pageSize) break;
            }

            console.log(`🔎 Fetched ${existingTrades.length} existing trades from database`);

            /* ------------ Create existing keys set for comparison ------------ */
            const existingKeys = new Set<string>();
            existingTrades.forEach((trade, index) => {
              const key = createCompositeKey({
                datetime: trade.datetime,
                symbol: trade.symbol?.toUpperCase().trim() || null,
                side: trade.side?.toUpperCase().trim() || null,
                qty: trade.qty,
                price: trade.price,
                pnl: trade.pnl,
                notes: null
              });
              if (key) {
                console.log(`🔑 Existing trade ${index + 1} key: ${key}`);
                existingKeys.add(key);
              }
            });

            console.log(`🔑 Generated ${existingKeys.size} existing trade keys`);

            /* ------------ Separate new trades from duplicates ------------ */
            const newTrades: typeof tradesToProcess = [];
            const duplicateEntries: TradeAnalysisSummary['duplicateEntries'] = [];

            tradesToProcess.forEach((trade, index) => {
              const key = createCompositeKey(trade);
              if (!key) {
                console.warn(`⚠️ Empty key for processed trade ${index + 1}, skipping`);
                return;
              }
              
              console.log(`🔍 Checking trade ${index + 1} with key: ${key}`);
              
              if (existingKeys.has(key)) {
                console.log(`🚫 DUPLICATE FOUND: ${key}`);
                duplicateEntries.push({
                  datetime: trade.datetime,
                  symbol: trade.symbol || '',
                  side: trade.side || '',
                  qty: trade.qty || 0,
                  price: trade.price || 0,
                  pnl: trade.pnl || 0
                });
              } else {
                console.log(`✅ NEW TRADE: ${key}`);
                newTrades.push(trade);
              }
            });

            const uploadSummary: TradeAnalysisSummary = {
              totalRows: totalParsedRows,
              duplicatesSkipped: duplicateEntries.length + internalDuplicates.length,
              newEntriesInserted: newTrades.length,
              fileName: file.name,
              uploadTimestamp,
              duplicateEntries
            };

            console.log('📋 Upload Summary:', uploadSummary);

            /* ------------ Handle case with no new trades ------------ */
            if (!newTrades.length) {
              try {
                await supabase.from('raw_trade_data').insert({
                  user_id: user.id,
                  file_name: file.name,
                  headers: csvHeaders,
                  data: JSON.parse(
                    JSON.stringify({ 
                      mapping: headerMapping, 
                      rows: results.data.slice(0, 10), 
                      uploadSummary 
                    })
                  )
                });
              } catch (error) {
                console.error('Failed to save raw data:', error);
              }

              const duplicateMessage = uploadSummary.duplicatesSkipped > 0 
                ? `All ${uploadSummary.duplicatesSkipped} entries already exist in your journal.`
                : 'No valid new trades found in the uploaded file.';

              toast({
                title: 'No New Trades',
                description: duplicateMessage,
                variant: 'destructive'
              });
              
              setLoadingMessage('');
              return;
            }

            /* ------------ Store raw CSV snapshot & summary ------------ */
            setLoadingMessage('Saving raw file data...');
            const { data: rawData, error: rawError } = await supabase
              .from('raw_trade_data')
              .insert({
                user_id: user.id,
                file_name: file.name,
                headers: csvHeaders,
                data: JSON.parse(JSON.stringify({ 
                  mapping: headerMapping, 
                  rows: results.data, 
                  uploadSummary 
                }))
              })
              .select()
              .single();
            
            if (rawError) throw rawError;

            /* ------------ Calculate metrics & create session ------------ */
            setLoadingMessage('Calculating trade metrics...');
            const metrics = calculateMetrics(newTrades as Trade[]);

            console.log('📊 Calculated metrics:', metrics);

            const { data: newSession, error: sessionError } = await supabase
              .from('trade_sessions')
              .insert({
                journal_id: journal.id,
                user_id: user.id,
                ...metrics,
                raw_data_id: rawData.id
              })
              .select()
              .single();
            
            if (sessionError) throw sessionError;

            /* ------------ Insert new trades ------------ */
            setLoadingMessage(`Inserting ${newTrades.length} trades...`);
            const tradesData = newTrades.map((t) => ({
              ...t,
              session_id: newSession.id,
              user_id: user.id,
              journal_id: journal.id
            }));
            
            const { error: tradesError } = await supabase.from('trades').insert(tradesData);
            if (tradesError) throw tradesError;

            /* ------------ Optional AI insights ------------ */
            try {
              setLoadingMessage('Generating AI insights...');
              const { data: insights, error: insightsError } = await supabase.functions.invoke<
                Partial<Tables<'trade_sessions'>>
              >('analyze-trades', { body: { trades: tradesData.slice(0, 100) } });
              
              if (!insightsError && insights) {
                await supabase.from('trade_sessions').update(insights).eq('id', newSession.id);
              }
            } catch (err) {
              console.warn('AI insights failed:', err);
            }

            /* ------------ Show success notification with duplicate info ------------ */
            const successMessage = uploadSummary.duplicatesSkipped > 0
              ? `Successfully inserted ${uploadSummary.newEntriesInserted} new trades. ${uploadSummary.duplicatesSkipped} duplicates were skipped.`
              : `Successfully inserted ${uploadSummary.newEntriesInserted} trades.`;

            toast({
              title: 'Upload Complete!',
              description: successMessage
            });

            // Show additional notification for duplicates if any
            if (uploadSummary.duplicatesSkipped > 0) {
              setTimeout(() => {
                toast({
                  title: 'Duplicate Trades Found',
                  description: `${uploadSummary.duplicatesSkipped} duplicate trades were identified and skipped to prevent data duplication.`,
                  variant: 'default'
                });
              }, 2000);
            }

            setLoadingMessage('');
            window.location.reload();
          } catch (err) {
            console.error('Error processing CSV:', err);
            toast({ 
              title: 'Upload Error', 
              description: (err as Error).message, 
              variant: 'destructive' 
            });
            setLoadingMessage('');
          }
        },
        error: (error) => {
          console.error('CSV parsing error:', error);
          toast({ 
            title: 'CSV Parsing Error', 
            description: error.message, 
            variant: 'destructive' 
          });
          setLoadingMessage('');
        }
      });
    } catch (error) {
      console.error('Failed to read file:', error);
      toast({
        title: 'File Read Error',
        description: 'Failed to read the uploaded file.',
        variant: 'destructive'
      });
      setLoadingMessage('');
    }
  };

  return { processCsv, loadingMessage };
};
