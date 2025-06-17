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
  missingColumns: string[];
  dataQualityScore: number;
  duplicateEntries: Array<{
    datetime: string;
    symbol: string;
    side: string;
    qty: number;
    price: number;
    pnl: number;
  }>;
  psychologicalPatterns: {
    revengeTrading: boolean;
    overconfidence: boolean;
    fearOfMissing: boolean;
    lossAversion: boolean;
  };
  timePatterns: {
    bestPerformingHours: string[];
    worstPerformingHours: string[];
    averageHoldTime: string;
  };
}

// Essential columns for trading analysis
const ESSENTIAL_COLUMNS = ['datetime', 'symbol', 'side', 'qty', 'price', 'pnl'];

/** Enhanced robust float parser handling $, commas, spaces, (neg), trailing -neg, etc. */
const safeParseFloat = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    let cleanValue = value.trim();
    
    // Handle empty or invalid strings
    if (!cleanValue || cleanValue === '' || cleanValue === 'null' || cleanValue === 'undefined') {
      return 0;
    }

    let isNegative = false;

    // Check for parentheses indicating negative (12.50) -> -12.50
    if (cleanValue.startsWith('(') && cleanValue.endsWith(')')) {
      isNegative = true;
      cleanValue = cleanValue.slice(1, -1);
    }

    // Check for trailing minus (12.50-) -> -12.50
    if (cleanValue.endsWith('-')) {
      isNegative = true;
      cleanValue = cleanValue.slice(0, -1);
    }

    // Check for leading minus
    if (cleanValue.startsWith('-')) {
      isNegative = true;
      cleanValue = cleanValue.slice(1);
    }

    // Remove currency symbols, commas, spaces, and other non-numeric characters
    cleanValue = cleanValue.replace(/[$,%\s€£¥₹¢]+/g, '');
    
    // Keep only digits and dots
    cleanValue = cleanValue.replace(/[^0-9.]/g, '');
    
    // Handle multiple dots - keep only the first one
    const dotIndex = cleanValue.indexOf('.');
    if (dotIndex !== -1) {
      const beforeDot = cleanValue.substring(0, dotIndex);
      const afterDot = cleanValue.substring(dotIndex + 1).replace(/\./g, '');
      cleanValue = beforeDot + '.' + afterDot;
    }

    const parsed = parseFloat(cleanValue);
    const result = isNaN(parsed) ? 0 : parsed;
    
    return isNegative ? -result : result;
  }
  return 0;
};

/** Enhanced composite key for deduplication with better normalization */
const createCompositeKey = (
  trade: Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>
): string => {
  // Normalize datetime to epoch milliseconds for consistent comparison
  const epochTime = new Date(trade.datetime).getTime();
  
  // Normalize symbol and side to uppercase and trim whitespace
  const symbol = (trade.symbol || '').toString().toUpperCase().trim();
  const side = (trade.side || '').toString().toUpperCase().trim();

  // Format numbers to fixed decimal places for consistent comparison
  const formatNumber = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '0';
    return Number(n).toFixed(8);
  };

  const qty = formatNumber(trade.qty);
  const price = formatNumber(trade.price);
  const pnl = formatNumber(trade.pnl);

  return `${epochTime}|${symbol}|${side}|${qty}|${price}|${pnl}`;
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

/** Analyze psychological patterns in trading data */
const analyzePsychologicalPatterns = (trades: any[]) => {
  const patterns = {
    revengeTrading: false,
    overconfidence: false,
    fearOfMissing: false,
    lossAversion: false
  };

  if (trades.length < 3) return patterns;

  // Sort trades by datetime
  const sortedTrades = trades.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  // Analyze revenge trading: increasing position size after losses
  let consecutiveLosses = 0;
  for (let i = 0; i < sortedTrades.length - 1; i++) {
    const currentTrade = sortedTrades[i];
    const nextTrade = sortedTrades[i + 1];
    
    if (safeParseFloat(currentTrade.pnl) < 0) {
      consecutiveLosses++;
      // Check if next trade has significantly larger position size
      if (consecutiveLosses >= 2 && safeParseFloat(nextTrade.qty) > safeParseFloat(currentTrade.qty) * 1.5) {
        patterns.revengeTrading = true;
      }
    } else {
      consecutiveLosses = 0;
    }
  }

  // Analyze overconfidence: increasing risk after wins
  let consecutiveWins = 0;
  for (let i = 0; i < sortedTrades.length - 1; i++) {
    const currentTrade = sortedTrades[i];
    const nextTrade = sortedTrades[i + 1];
    
    if (safeParseFloat(currentTrade.pnl) > 0) {
      consecutiveWins++;
      if (consecutiveWins >= 3 && safeParseFloat(nextTrade.qty) > safeParseFloat(currentTrade.qty) * 1.3) {
        patterns.overconfidence = true;
      }
    } else {
      consecutiveWins = 0;
    }
  }

  // Analyze loss aversion: quick profit taking vs letting losses run
  const winners = sortedTrades.filter(t => safeParseFloat(t.pnl) > 0);
  const losers = sortedTrades.filter(t => safeParseFloat(t.pnl) < 0);
  
  if (winners.length > 0 && losers.length > 0) {
    const avgWinSize = winners.reduce((sum, t) => sum + Math.abs(safeParseFloat(t.pnl)), 0) / winners.length;
    const avgLossSize = losers.reduce((sum, t) => sum + Math.abs(safeParseFloat(t.pnl)), 0) / losers.length;
    
    if (avgLossSize > avgWinSize * 1.5) {
      patterns.lossAversion = true;
    }
  }

  return patterns;
};

/** Analyze time-based trading patterns */
const analyzeTimePatterns = (trades: any[]) => {
  const hourlyPnL: { [hour: number]: number[] } = {};
  
  trades.forEach(trade => {
    const hour = new Date(trade.datetime).getHours();
    const pnl = safeParseFloat(trade.pnl);
    
    if (!hourlyPnL[hour]) hourlyPnL[hour] = [];
    hourlyPnL[hour].push(pnl);
  });

  const hourlyAverage = Object.entries(hourlyPnL).map(([hour, pnls]) => ({
    hour: parseInt(hour),
    avgPnl: pnls.reduce((sum, pnl) => sum + pnl, 0) / pnls.length,
    count: pnls.length
  }));

  // Sort by average P&L and filter hours with at least 3 trades
  const significantHours = hourlyAverage.filter(h => h.count >= 3).sort((a, b) => b.avgPnl - a.avgPnl);
  
  const bestHours = significantHours.slice(0, 2).map(h => `${h.hour}:00`);
  const worstHours = significantHours.slice(-2).map(h => `${h.hour}:00`);

  return {
    bestPerformingHours: bestHours,
    worstPerformingHours: worstHours,
    averageHoldTime: 'N/A' // Could be calculated if we had entry/exit times
  };
};

/** Calculate data quality score based on completeness */
const calculateDataQuality = (trades: any[], headerMapping: Record<string, string>) => {
  let score = 0;
  const maxScore = 100;

  // Check for essential columns (60 points)
  const essentialFound = ESSENTIAL_COLUMNS.filter(col => headerMapping[col]).length;
  score += (essentialFound / ESSENTIAL_COLUMNS.length) * 60;

  // Check data completeness (40 points)
  if (trades.length > 0) {
    const completenessScores = trades.map(trade => {
      let tradeScore = 0;
      if (trade.symbol && trade.symbol.trim()) tradeScore += 10;
      if (trade.datetime && !isNaN(new Date(trade.datetime).getTime())) tradeScore += 10;
      if (trade.side && (trade.side.toUpperCase() === 'BUY' || trade.side.toUpperCase() === 'SELL')) tradeScore += 10;
      if (trade.pnl !== undefined && trade.pnl !== null && !isNaN(safeParseFloat(trade.pnl))) tradeScore += 10;
      return tradeScore;
    });
    
    const avgCompleteness = completenessScores.reduce((sum, s) => sum + s, 0) / completenessScores.length;
    score += avgCompleteness;
  }

  return Math.min(score, maxScore);
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
    console.log(`Starting CSV upload for file: ${file.name} at ${uploadTimestamp}`);

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

          /* ------------ Step 1: Validate if CSV contains trading data ------------ */
          setLoadingMessage('Validating trading data...');
          const { data: validationData, error: validationError } = await supabase.functions.invoke<
            { is_trading_related: boolean }
          >('validate-csv-content', { body: { csvHeaders, csvDataSample } });
          
          if (validationError) throw validationError;
          
          if (!validationData?.is_trading_related) {
            throw new Error('The uploaded CSV does not appear to contain trading data. Please ensure your file contains columns like symbol, price, quantity, profit/loss, etc.');
          }

          /* ------------ Step 2: Map columns to expected format ------------ */
          setLoadingMessage('Mapping CSV columns...');
          const { data: mappingData, error: mappingError } = await supabase.functions.invoke<
            { mapping: Record<string, string> }
          >('map-columns-with-gemini', { body: { csvHeaders, csvDataSample } });
          
          if (mappingError) throw mappingError;
          headerMapping = mappingData?.mapping || {};

          /* ------------ Step 3: Check for essential columns ------------ */
          const missingColumns = ESSENTIAL_COLUMNS.filter(col => !headerMapping[col]);
          if (missingColumns.length > 0) {
            const missingList = missingColumns.join(', ');
            throw new Error(
              `Essential trading columns are missing: ${missingList}. ` +
              `Please ensure your CSV contains columns for: date/time, symbol/instrument, buy/sell side, quantity, price, and profit/loss.`
            );
          }

          const getVal = (row: CsvRow, key: string) => {
            const header = headerMapping[key];
            return header ? row[header] : undefined;
          };

          /* ------------ Step 4: Parse and normalize data formats ------------ */
          setLoadingMessage('Normalizing trade data...');
          const parsedTrades: Array<Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>> = [];
          const skippedRows: Array<{ row: number; reason: string }> = [];

          results.data.forEach((row, index) => {
            try {
              const datetimeVal = getVal(row, 'datetime') || row.Timestamp || row.Time || row.Date;
              if (!datetimeVal) {
                skippedRows.push({ row: index + 1, reason: 'Missing datetime value' });
                return;
              }

              const trade = {
                datetime: new Date(datetimeVal as string).toISOString(),
                symbol: (getVal(row, 'symbol') || row.Symbol || row.Instrument)?.toString().trim().toUpperCase() || null,
                side: (getVal(row, 'side') || row.Side || row.Action || row.Type)?.toString().trim().toUpperCase() || null,
                qty: safeParseFloat(getVal(row, 'qty') || row.Qty || row.Quantity || row.Size),
                price: safeParseFloat(getVal(row, 'price') || row.Price || row.EntryPrice || row.ExitPrice),
                pnl: safeParseFloat(getVal(row, 'pnl') || row.PnL || row['P/L'] || row.NetPL || row.Profit || row.Loss),
                notes: ((getVal(row, 'notes') || row.Notes || row.Comment || '') as string).trim() || null
              };

              // Skip rows with mock data
              if (isMockData(trade)) {
                skippedRows.push({ row: index + 1, reason: 'Detected mock/demo data' });
                return;
              }

              // Skip rows with no meaningful data
              if (!trade.symbol || (trade.pnl === 0 && trade.qty === 0 && trade.price === 0)) {
                skippedRows.push({ row: index + 1, reason: 'No meaningful trade data' });
                return;
              }

              parsedTrades.push(trade);
            } catch (error) {
              skippedRows.push({ row: index + 1, reason: `Parsing error: ${error.message}` });
            }
          });

          if (skippedRows.length > 0) {
            console.log(`Skipped ${skippedRows.length} rows:`, skippedRows);
          }

          /* ------------ Step 5: Remove duplicates ------------ */
          setLoadingMessage('Checking for duplicates...');
          const uniqueTrades: Record<string, typeof parsedTrades[0]> = {};
          const internalDuplicates: typeof parsedTrades = [];

          parsedTrades.forEach((trade) => {
            const key = createCompositeKey(trade);
            if (uniqueTrades[key]) {
              internalDuplicates.push(trade);
            } else {
              uniqueTrades[key] = trade;
            }
          });

          const tradesToProcess = Object.values(uniqueTrades);
          
          if (!tradesToProcess.length) {
            throw new Error('No valid trades found after processing. Check your CSV format and ensure it contains real trading data.');
          }

          /* ------------ Step 6: Check against existing data ------------ */
          setLoadingMessage('Removing mock data...');
          const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE'];
          await supabase
            .from('trades')
            .delete()
            .eq('journal_id', journal.id)
            .in('symbol', mockSymbols);

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

          const existingKeys = new Set(
            existingTrades.map((t) =>
              createCompositeKey({
                datetime: t.datetime,
                symbol: t.symbol?.toUpperCase().trim() || null,
                side: t.side?.toUpperCase().trim() || null,
                qty: t.qty,
                price: t.price,
                pnl: t.pnl,
                notes: null
              })
            )
          );

          const newTrades: typeof tradesToProcess = [];
          const duplicateEntries: TradeAnalysisSummary['duplicateEntries'] = [];

          tradesToProcess.forEach((trade) => {
            const key = createCompositeKey(trade);
            if (existingKeys.has(key)) {
              duplicateEntries.push({
                datetime: trade.datetime,
                symbol: trade.symbol || '',
                side: trade.side || '',
                qty: trade.qty || 0,
                price: trade.price || 0,
                pnl: trade.pnl || 0
              });
            } else {
              newTrades.push(trade);
            }
          });

          /* ------------ Step 7: Generate comprehensive analysis summary ------------ */
          const psychologicalPatterns = analyzePsychologicalPatterns(newTrades);
          const timePatterns = analyzeTimePatterns(newTrades);
          const dataQualityScore = calculateDataQuality(newTrades, headerMapping);

          const analysisSummary: TradeAnalysisSummary = {
            totalRows: parsedTrades.length,
            duplicatesSkipped: duplicateEntries.length + internalDuplicates.length,
            newEntriesInserted: newTrades.length,
            fileName: file.name,
            uploadTimestamp,
            missingColumns,
            dataQualityScore,
            duplicateEntries,
            psychologicalPatterns,
            timePatterns
          };

          console.log('Trade Analysis Summary:', analysisSummary);

          if (!newTrades.length) {
            await supabase.from('raw_trade_data').insert({
              user_id: user.id,
              file_name: file.name,
              headers: csvHeaders,
              data: JSON.parse(
                JSON.stringify({ 
                  mapping: headerMapping, 
                  rows: results.data.slice(0, 10), 
                  analysisSummary 
                })
              )
            });

            const duplicateMessage = analysisSummary.duplicatesSkipped > 0 
              ? `All ${analysisSummary.duplicatesSkipped} entries already exist in your journal.`
              : 'No valid new trades found in the uploaded file.';

            toast({
              title: 'No New Trades',
              description: duplicateMessage,
              variant: 'destructive'
            });
            
            setLoadingMessage('');
            return;
          }

          /* ------------ Step 8: Store raw data and calculate metrics ------------ */
          setLoadingMessage('Saving trade data...');
          const { data: rawData, error: rawError } = await supabase
            .from('raw_trade_data')
            .insert({
              user_id: user.id,
              file_name: file.name,
              headers: csvHeaders,
              data: JSON.parse(JSON.stringify({ 
                mapping: headerMapping, 
                rows: results.data, 
                analysisSummary 
              }))
            })
            .select()
            .single();
          
          if (rawError) throw rawError;

          setLoadingMessage('Calculating trade metrics...');
          const metrics = calculateMetrics(newTrades as Trade[]);

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

          setLoadingMessage(`Inserting ${newTrades.length} trades...`);
          const tradesData = newTrades.map((t) => ({
            ...t,
            session_id: newSession.id,
            user_id: user.id,
            journal_id: journal.id
          }));
          
          const { error: tradesError } = await supabase.from('trades').insert(tradesData);
          if (tradesError) throw tradesError;

          /* ------------ Step 9: Generate AI insights ------------ */
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

          /* ------------ Step 10: Provide comprehensive summary ------------ */
          const successMessage = `Successfully processed ${analysisSummary.newEntriesInserted} trades with ${dataQualityScore.toFixed(0)}% data quality score.`;
          
          let psychologicalInsights = '';
          if (psychologicalPatterns.revengeTrading) psychologicalInsights += 'Revenge trading detected. ';
          if (psychologicalPatterns.overconfidence) psychologicalInsights += 'Overconfidence pattern found. ';
          if (psychologicalPatterns.lossAversion) psychologicalInsights += 'Loss aversion behavior identified. ';

          const detailedMessage = psychologicalInsights 
            ? `${successMessage} ${psychologicalInsights}Best trading hours: ${timePatterns.bestPerformingHours.join(', ')}.`
            : successMessage;

          toast({
            title: 'Analysis Complete!',
            description: detailedMessage
          });

          // Show warning for missing columns
          if (missingColumns.length > 0) {
            setTimeout(() => {
              toast({
                title: 'Data Quality Notice',
                description: `Some optional columns were not found: ${missingColumns.join(', ')}. Analysis may be limited.`,
                variant: 'default'
              });
            }, 2000);
          }

          // Show duplicate notification if any
          if (analysisSummary.duplicatesSkipped > 0) {
            setTimeout(() => {
              toast({
                title: 'Duplicate Trades',
                description: `${analysisSummary.duplicatesSkipped} duplicate trades were skipped to prevent data duplication.`,
                variant: 'default'
              });
            }, 4000);
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
  };

  return { processCsv, loadingMessage };
};