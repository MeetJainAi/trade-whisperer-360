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
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    let cleanValue = value.trim();
    
    // Handle empty or invalid strings
    if (!cleanValue || cleanValue === '' || cleanValue === 'null' || cleanValue === 'undefined') {
      return 0;
    }

    console.log(`🔍 Parsing value: "${value}" -> cleaned: "${cleanValue}"`);

    let isNegative = false;

    // Handle parentheses formats: (500), ($500), (500.00), etc.
    // More robust regex to catch various parentheses formats
    const parenthesesPatterns = [
      /^\s*\(\s*\$?([0-9,.-]+)\s*\)\s*$/,  // (500) or ($500)
      /^\s*\(\s*([0-9,.-]+)\s*\)\s*$/,      // Simple (500)
      /^\s*\$\s*\(\s*([0-9,.-]+)\s*\)\s*$/, // $(500)
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

    // Check for trailing minus: 500-, $500-, 500.00-, etc.
    if (!isNegative && cleanValue.match(/.*-\s*$/)) {
      isNegative = true;
      cleanValue = cleanValue.replace(/-\s*$/, '');
      console.log(`➖ Found trailing minus: "${value}" -> negative: ${cleanValue}`);
    }

    // Check for leading minus (but not if we already detected negative from parentheses)
    if (!isNegative && cleanValue.startsWith('-')) {
      isNegative = true;
      cleanValue = cleanValue.slice(1);
      console.log(`⬅️ Found leading minus: "${value}" -> negative: ${cleanValue}`);
    }

    // Remove all currency symbols, commas, spaces, and other non-numeric characters
    // Keep only digits, dots, and handle multiple currencies
    cleanValue = cleanValue.replace(/[$,%\s€£¥₹¢₨₩₪₫₡₦₨₱₽₪₴₸₼₿]+/g, '');
    
    // Remove any remaining non-numeric characters except dots
    cleanValue = cleanValue.replace(/[^0-9.]/g, '');
    
    // Handle multiple dots - keep only the first one as decimal separator
    const dotIndex = cleanValue.indexOf('.');
    if (dotIndex !== -1) {
      const beforeDot = cleanValue.substring(0, dotIndex);
      const afterDot = cleanValue.substring(dotIndex + 1).replace(/\./g, '');
      cleanValue = beforeDot + '.' + afterDot;
    }

    // Handle edge case where we might have just a dot
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

/** ROBUST composite key for deduplication with normalized comparison */
const createCompositeKey = (
  trade: Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>
): string => {
  // Normalize datetime to date only (ignore time differences)
  const date = new Date(trade.datetime);
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  
  // Normalize symbol and side
  const symbol = (trade.symbol || '').toString().toUpperCase().trim();
  const side = (trade.side || '').toString().toUpperCase().trim();

  // Round numbers to 2 decimal places for comparison (not 8!)
  const formatNumber = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '0.00';
    return Number(n).toFixed(2);
  };

  const qty = formatNumber(trade.qty);
  const price = formatNumber(trade.price);
  const pnl = formatNumber(trade.pnl);

  const key = `${dateKey}|${symbol}|${side}|${qty}|${price}|${pnl}`;
  return key;
};

/** Check if data appears to be mock/demo data */
const isMockData = (trade: any): boolean => {
  const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE'];
  const symbol = (trade.symbol || '').toString().toUpperCase().trim();
  
  // Check for mock symbols
  if (mockSymbols.includes(symbol)) return true;
  
  // Check for obvious test data patterns
  if (symbol.includes('TEST') || symbol.includes('DEMO') || symbol.includes('SAMPLE')) return true;
  
  // Check for round numbers that might indicate mock data
  const pnl = Math.abs(safeParseFloat(trade.pnl));
  const price = safeParseFloat(trade.price);
  
  // Very round numbers might be mock data (but this is less reliable)
  if (pnl > 0 && pnl % 100 === 0 && price > 0 && price % 10 === 0) return true;
  
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
    const text = await file.text();

    Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
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
          headerMapping = mappingData?.mapping || {};

          console.log('🗺️ Column Mapping:', headerMapping);

          const getVal = (row: CsvRow, key: string) => {
            const header = headerMapping[key];
            return header ? row[header] : undefined;
          };

          /* ------------ Parse & deduplicate in-memory ------------ */
          setLoadingMessage('Processing trade data...');
          const parsedTrades: Array<Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>> = [];

          console.log(`🔄 Processing ${results.data.length} rows...`);

          results.data.forEach((row, index) => {
            try {
              const datetimeVal = getVal(row, 'datetime') || row.Timestamp || row.Time || row.Date;
              if (!datetimeVal) {
                console.warn(`Row ${index + 1}: Missing datetime value, skipping`);
                return;
              }

              // Get the raw P&L value BEFORE parsing
              const rawPnlValue = getVal(row, 'pnl') || row.PnL || row['P/L'] || row.NetPL || row.Profit || row.Loss || row.profit_loss;
              
              console.log(`📈 Row ${index + 1} - Raw P&L value: "${rawPnlValue}"`);

              const trade = {
                datetime: new Date(datetimeVal as string).toISOString(),
                symbol: (getVal(row, 'symbol') || row.Symbol || row.Instrument)?.toString().trim().toUpperCase() || null,
                side: (getVal(row, 'side') || row.Side || row.Action || row.Type)?.toString().trim().toUpperCase() || null,
                qty: safeParseFloat(getVal(row, 'qty') || row.Qty || row.Quantity || row.Size),
                price: safeParseFloat(getVal(row, 'price') || row.Price || row.EntryPrice || row.ExitPrice),
                pnl: safeParseFloat(rawPnlValue),
                notes: ((getVal(row, 'notes') || row.Notes || row.Comment || '') as string).trim() || null
              };

              console.log(`📊 Row ${index + 1} - Parsed trade:`, {
                symbol: trade.symbol,
                pnl: trade.pnl,
                rawPnl: rawPnlValue,
                compositeKey: createCompositeKey(trade)
              });

              // Skip rows with invalid or mock data
              if (isMockData(trade)) {
                console.warn(`Row ${index + 1}: Detected mock data, skipping`);
                return;
              }

              // Skip rows with no meaningful data
              if (!trade.symbol || (trade.pnl === 0 && trade.qty === 0 && trade.price === 0)) {
                console.warn(`Row ${index + 1}: No meaningful trade data, skipping`);
                return;
              }

              parsedTrades.push(trade);
            } catch (error) {
              console.error(`Error parsing row ${index + 1}:`, error);
            }
          });

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

          parsedTrades.forEach((trade) => {
            const key = createCompositeKey(trade);
            if (uniqueTrades[key]) {
              internalDuplicates.push(trade);
              console.log(`🔄 Internal duplicate found: ${trade.symbol} at ${trade.datetime}`);
            } else {
              uniqueTrades[key] = trade;
            }
          });

          const tradesToProcess = Object.values(uniqueTrades);
          const totalParsedRows = parsedTrades.length;
          
          if (!tradesToProcess.length) {
            throw new Error('No valid trades found. Check your CSV format and ensure it contains trading data.');
          }

          console.log(`📈 Parsed ${totalParsedRows} rows, found ${tradesToProcess.length} unique trades, ${internalDuplicates.length} internal duplicates`);

          /* ------------ Remove existing mock/demo data from database ------------ */
          setLoadingMessage('Removing mock data...');
          const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE'];
          await supabase
            .from('trades')
            .delete()
            .eq('journal_id', journal.id)
            .in('symbol', mockSymbols);

          /* ------------ Fetch ALL existing trades for duplicate check ------------ */
          setLoadingMessage('Checking for duplicate trades...');
          console.log(`🔍 Fetching existing trades for journal ${journal.id}...`);

          // Fetch ALL existing trades with proper pagination
          const existingTrades: Array<{
            datetime: string;
            symbol: string | null;
            side: string | null;
            qty: number | null;
            price: number | null;
            pnl: number | null;
          }> = [];

          let hasMore = true;
          let from = 0;
          const pageSize = 1000;

          while (hasMore) {
            const { data, error } = await supabase
              .from('trades')
              .select('datetime, symbol, side, qty, price, pnl')
              .eq('journal_id', journal.id)
              .range(from, from + pageSize - 1);
            
            if (error) {
              console.error('❌ Error fetching existing trades:', error);
              throw error;
            }
            
            if (data && data.length > 0) {
              existingTrades.push(...data);
              console.log(`📥 Fetched ${data.length} existing trades (batch ${Math.floor(from / pageSize) + 1})`);
            }
            
            // Check if there are more records
            hasMore = data && data.length === pageSize;
            from += pageSize;
          }

          console.log(`📊 Total existing trades in journal: ${existingTrades.length}`);

          /* ------------ Create existing keys set for comparison ------------ */
          const existingKeys = new Set<string>();
          
          existingTrades.forEach((t) => {
            const key = createCompositeKey({
              datetime: t.datetime,
              symbol: t.symbol?.toUpperCase().trim() || null,
              side: t.side?.toUpperCase().trim() || null,
              qty: t.qty,
              price: t.price,
              pnl: t.pnl,
              notes: null
            });
            existingKeys.add(key);
          });

          console.log(`🔑 Generated ${existingKeys.size} existing trade keys for comparison`);

          /* ------------ Separate new trades from duplicates ------------ */
          const newTrades: typeof tradesToProcess = [];
          const duplicateEntries: TradeAnalysisSummary['duplicateEntries'] = [];

          tradesToProcess.forEach((trade) => {
            const key = createCompositeKey(trade);
            console.log(`🔍 Checking trade key: ${key}`);
            
            if (existingKeys.has(key)) {
              duplicateEntries.push({
                datetime: trade.datetime,
                symbol: trade.symbol || '',
                side: trade.side || '',
                qty: trade.qty || 0,
                price: trade.price || 0,
                pnl: trade.pnl || 0
              });
              console.log(`🔄 Database duplicate found: ${trade.symbol} at ${trade.datetime} (P&L: ${trade.pnl})`);
            } else {
              newTrades.push(trade);
              console.log(`✅ New trade found: ${trade.symbol} at ${trade.datetime} (P&L: ${trade.pnl})`);
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
            console.log('🚫 No new trades to insert - all are duplicates');
            
            // Still store raw data for reference
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

          /* ------------ Deterministic AI insights ------------ */
          try {
            setLoadingMessage('Generating AI insights...');
            
            // Create a deterministic "seed" based on the data for consistent results
            const dataFingerprint = JSON.stringify({
              totalTrades: newTrades.length,
              totalPnL: metrics.total_pnl,
              winRate: metrics.win_rate,
              symbols: [...new Set(newTrades.map(t => t.symbol))].sort(),
              fileName: file.name,
              dateRange: {
                start: newTrades[0]?.datetime,
                end: newTrades[newTrades.length - 1]?.datetime
              }
            });

            const { data: insights, error: insightsError } = await supabase.functions.invoke<
              Partial<Tables<'trade_sessions'>>
            >('analyze-trades', { 
              body: { 
                trades: tradesData.slice(0, 100),
                dataFingerprint // Include fingerprint for consistency
              } 
            });
            
            if (!insightsError && insights) {
              await supabase.from('trade_sessions').update(insights).eq('id', newSession.id);
              console.log('🧠 AI insights generated and saved');
            }
          } catch (err) {
            console.warn('⚠️ AI insights failed:', err);
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
          console.error('❌ Error processing CSV:', err);
          toast({ 
            title: 'Upload Error', 
            description: (err as Error).message, 
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
  };

  return { processCsv, loadingMessage };
};