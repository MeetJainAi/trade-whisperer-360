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
        break;
      }
    }

    // Check for trailing minus: 500-, $500-, 500.00-
    if (!isNegative && cleanValue.endsWith('-')) {
      isNegative = true;
      cleanValue = cleanValue.slice(0, -1);
    }

    // Check for leading minus (but not if we already detected negative from parentheses)
    if (!isNegative && cleanValue.startsWith('-')) {
      isNegative = true;
      cleanValue = cleanValue.slice(1);
    }

    // Remove currency symbols, commas, and other non-numeric characters
    cleanValue = cleanValue.replace(/[$,%\s€£¥₹¢₨₩₪₫₡₦₨₱₽₪₴₸₼₿]+/g, '');
    
    // Remove any remaining non-numeric characters except dots
    cleanValue = cleanValue.replace(/[^0-9.]/g, '');
    
    // Handle multiple dots - keep only the first one
    const dotIndex = cleanValue.indexOf('.');
    if (dotIndex !== -1) {
      const beforeDot = cleanValue.substring(0, dotIndex);
      const afterDot = cleanValue.substring(dotIndex + 1).replace(/\./g, '');
      cleanValue = beforeDot + '.' + afterDot;
    }

    if (cleanValue === '.' || cleanValue === '') {
      return 0;
    }

    const parsed = parseFloat(cleanValue);
    const result = isNaN(parsed) ? 0 : parsed;
    
    return isNegative ? -Math.abs(result) : result;
  }
  return 0;
};

/**
 * Creates a robust composite key for deduplication.
 * This key uses the full ISO datetime string and normalized values for other fields.
 */
const createCompositeKey = (
  trade: Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>
): string => {
  // Use the full ISO string for precise datetime matching
  const datetimeKey = new Date(trade.datetime).toISOString();
  
  // Normalize symbol and side to be case-insensitive
  const symbol = (trade.symbol || '').toString().toUpperCase().trim();
  const side = (trade.side || '').toString().toUpperCase().trim();

  // Round numbers to a consistent precision (e.g., 4 decimal places)
  const formatNumber = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '0.0000';
    return Number(n).toFixed(4);
  };

  const qty = formatNumber(trade.qty);
  const price = formatNumber(trade.price);
  const pnl = formatNumber(trade.pnl);

  const key = `${datetimeKey}|${symbol}|${side}|${qty}|${price}|${pnl}`;
  return key;
};

/** Check if data appears to be mock/demo data */
const isMockData = (trade: any): boolean => {
  const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'GOOGL', 'META', 'NVDA', 'AMZN', 'MSFT', 'DEMO', 'TEST', 'SAMPLE'];
  const symbol = (trade.symbol || '').toString().toUpperCase().trim();
  
  if (mockSymbols.includes(symbol)) return true;
  if (symbol.includes('TEST') || symbol.includes('DEMO') || symbol.includes('SAMPLE')) return true;
  
  const pnl = Math.abs(safeParseFloat(trade.pnl));
  const price = safeParseFloat(trade.price);
  
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

          setLoadingMessage('Validating CSV data...');
          const { data: validationData, error: validationError } = await supabase.functions.invoke<
            { is_trading_related: boolean }
          >('validate-csv-content', { body: { csvHeaders, csvDataSample } });
          if (validationError) throw validationError;
          if (!validationData?.is_trading_related) {
            throw new Error('The uploaded CSV does not appear to contain trading data.');
          }

          setLoadingMessage('Mapping CSV columns...');
          const { data: mappingData, error: mappingError } = await supabase.functions.invoke<
            { mapping: Record<string, string> }
          >('map-columns-with-gemini', { body: { csvHeaders, csvDataSample } });
          if (mappingError) throw mappingError;
          headerMapping = mappingData?.mapping || {};

          const getVal = (row: CsvRow, key: string) => {
            const header = headerMapping[key];
            return header ? row[header] : undefined;
          };

          setLoadingMessage('Processing and deduplicating trades...');
          const parsedTrades: Array<Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>> = [];
          results.data.forEach((row, index) => {
            try {
              const datetimeVal = getVal(row, 'datetime') || row.Timestamp || row.Time || row.Date;
              if (!datetimeVal) {
                console.warn(`Row ${index + 1}: Missing datetime value, skipping`);
                return;
              }

              const trade = {
                datetime: new Date(datetimeVal as string).toISOString(),
                symbol: (getVal(row, 'symbol') || row.Symbol || row.Instrument)?.toString().trim().toUpperCase() || null,
                side: (getVal(row, 'side') || row.Side || row.Action || row.Type)?.toString().trim().toUpperCase() || null,
                qty: safeParseFloat(getVal(row, 'qty') || row.Qty || row.Quantity || row.Size),
                price: safeParseFloat(getVal(row, 'price') || row.Price || row.EntryPrice || row.ExitPrice),
                pnl: safeParseFloat(getVal(row, 'pnl') || row.PnL || row['P/L'] || row.NetPL || row.Profit || row.Loss || row.profit_loss),
                notes: ((getVal(row, 'notes') || row.Notes || row.Comment || '') as string).trim() || null
              };

              if (isMockData(trade) || !trade.symbol || (trade.pnl === 0 && trade.qty === 0 && trade.price === 0)) {
                return;
              }

              parsedTrades.push(trade);
            } catch (error) {
              console.error(`Error parsing row ${index + 1}:`, error);
            }
          });

          // Remove duplicates within the uploaded file first
          const uniqueTradesInFile: Record<string, typeof parsedTrades[0]> = {};
          parsedTrades.forEach((trade) => {
            const key = createCompositeKey(trade);
            if (!uniqueTradesInFile[key]) {
              uniqueTradesInFile[key] = trade;
            }
          });
          const tradesToProcess = Object.values(uniqueTradesInFile);

          if (!tradesToProcess.length) {
            throw new Error('No valid new trades found in the uploaded file.');
          }

          setLoadingMessage('Checking for duplicates in the database...');
          const { data: existingTrades, error: fetchError } = await supabase
            .from('trades')
            .select('datetime,symbol,side,qty,price,pnl')
            .eq('journal_id', journal.id);
          
          if (fetchError) throw fetchError;

          const existingKeys = new Set<string>(existingTrades.map(t => createCompositeKey(t as any)));
          
          const newTrades: typeof tradesToProcess = [];
          const duplicateEntries: TradeAnalysisSummary['duplicateEntries'] = [];

          tradesToProcess.forEach((trade) => {
            const key = createCompositeKey(trade);
            if (existingKeys.has(key)) {
              duplicateEntries.push(trade as any);
            } else {
              newTrades.push(trade);
            }
          });

          const uploadSummary: TradeAnalysisSummary = {
            totalRows: results.data.length,
            duplicatesSkipped: tradesToProcess.length - newTrades.length,
            newEntriesInserted: newTrades.length,
            fileName: file.name,
            uploadTimestamp,
            duplicateEntries
          };

          if (!newTrades.length) {
            toast({
              title: 'No New Trades to Add',
              description: `All ${uploadSummary.duplicatesSkipped} valid trades from this file already exist in your journal.`,
              variant: 'destructive'
            });
            setLoadingMessage('');
            return;
          }

          setLoadingMessage('Saving analysis session...');
          const metrics = calculateMetrics(newTrades as Trade[]);
          const { data: newSession, error: sessionError } = await supabase
            .from('trade_sessions')
            .insert({ journal_id: journal.id, user_id: user.id, ...metrics })
            .select()
            .single();
          
          if (sessionError) throw sessionError;

          setLoadingMessage(`Inserting ${newTrades.length} new trades...`);
          const tradesData = newTrades.map((t) => ({
            ...t,
            session_id: newSession.id,
            user_id: user.id,
            journal_id: journal.id
          }));
          
          const { error: tradesError } = await supabase.from('trades').insert(tradesData);
          if (tradesError) throw tradesError;
          
          try {
            setLoadingMessage('Generating AI insights...');
            const { data: insights, error: insightsError } = await supabase.functions.invoke<
              Partial<Tables<'trade_sessions'>>
            >('analyze-trades', { body: { trades: tradesData.slice(0, 100) } });
            
            if (!insightsError && insights) {
              await supabase.from('trade_sessions').update(insights).eq('id', newSession.id);
            }
          } catch (err) {
            console.warn('⚠️ AI insights generation failed:', err);
          }

          const successMessage = uploadSummary.duplicatesSkipped > 0
            ? `Inserted ${uploadSummary.newEntriesInserted} new trades. ${uploadSummary.duplicatesSkipped} duplicates were skipped.`
            : `Successfully inserted ${uploadSummary.newEntriesInserted} trades.`;

          toast({
            title: 'Upload Complete!',
            description: successMessage
          });

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