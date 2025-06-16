import { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/components/AuthProvider';
import { calculateMetrics } from '@/lib/trade-metrics';

type Trade = Tables<'trades'>;
type Journal = Tables<'journals'>;

interface CsvRow {
  [key: string]: string | number | undefined;
}

export const safeParseFloat = (value: unknown): number => {
  if (typeof value !== 'string') return 0;
  let cleanValue = value.trim();
  // Record negative state when parentheses or trailing minus are present
  let isNegative = false;
  if (cleanValue.startsWith('(') && cleanValue.endsWith(')')) {
    isNegative = true;
    cleanValue = cleanValue.slice(1, -1);
  }
  if (cleanValue.endsWith('-')) {
    isNegative = !isNegative;
    cleanValue = cleanValue.slice(0, -1);
  }
  // Remove currency symbols, commas and spaces
  cleanValue = cleanValue.replace(/[$,\s]+/g, '');
  // Strip any remaining non-digit or dot characters
  cleanValue = cleanValue.replace(/[^0-9.]+/g, '');
  // Collapse multiple dots into one
  const parts = cleanValue.split('.');
  if (parts.length > 2) {
    cleanValue = parts[0] + '.' + parts.slice(1).join('');

  const parsed = parseFloat(cleanValue);
  if (isNaN(parsed)) return 0;
  return isNegative ? -parsed : parsed;

    // Remove currency symbols, commas, spaces first
    cleanValue = cleanValue.replace(/[$,\s]+/g, '');
    // Then strip anything not digit / dot / minus
    cleanValue = cleanValue.replace(/[^0-9.-]+/g, '');

    // Ensure only leading minus
    const isNeg = cleanValue.includes('-');
    cleanValue = cleanValue.replace(/-/g, '');
    if (isNeg) cleanValue = '-' + cleanValue;

    // Collapse multiple dots (keep first)
    const parts = cleanValue.split('.');
    if (parts.length > 2) cleanValue = parts[0] + '.' + parts.slice(1).join('');

    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

/** Composite key for deduplication (epoch|symbol|side|qty|price|pnl) */
const createCompositeKey = (
  trade: Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>
): string => {
  const epochTime = new Date(trade.datetime).getTime();
  const symbol = trade.symbol ? trade.symbol.toUpperCase().trim() : '';
  const side = trade.side ? trade.side.toUpperCase().trim() : '';

  const fmt = (n: number | null | undefined) =>
    n === null || n === undefined ? '' : Number(n).toFixed(8);

  return [
    epochTime,
    symbol,
    side,
    fmt(trade.qty),
    fmt(trade.price),
    fmt(trade.pnl)
  ].join('|');
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

          const getVal = (row: CsvRow, key: string) => {
            const header = headerMapping[key];
            return header ? row[header] : undefined;
          };

          /* ------------ Parse & deduplicate in-memory ------------ */
          setLoadingMessage('Processing trade data...');
          const unique: Record<
            string,
            Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>
          > = {};

          results.data.forEach((row) => {
            const datetimeVal = getVal(row, 'datetime') || row.Timestamp || row.Time;
            if (!datetimeVal) return;

            const trade = {
              datetime: new Date(datetimeVal as string).toISOString(),
              symbol: (getVal(row, 'symbol') || row.Symbol)?.toString().trim().toUpperCase(),
              side: (getVal(row, 'side') || row.Side)?.toString().trim().toUpperCase(),
              qty: safeParseFloat(getVal(row, 'qty') ?? row.Qty ?? row.Quantity),
              price: safeParseFloat(getVal(row, 'price') ?? row.Price),
              pnl: safeParseFloat(getVal(row, 'pnl') ?? row.PnL ?? row['P/L'] ?? row.NetPL),
              notes: (getVal(row, 'notes') || row.Notes || '') as string
            };

            const key = createCompositeKey(trade);
            if (!unique[key]) unique[key] = trade;
          });

          const tradesToProcess = Object.values(unique);
          const totalParsedRows = tradesToProcess.length;
          if (!totalParsedRows) {
            throw new Error('No valid trades found. Check column names (datetime, symbol, pnl).');
          }

          /* ------------ Remove any mock/demo data ------------ */
          setLoadingMessage('Removing mock data...');
          const mockSymbols = ['AAPL', 'TSLA', 'GOOG', 'META', 'NVDA', 'AMZN', 'MSFT'];
          await supabase
            .from('trades')
            .delete()
            .eq('journal_id', journal.id)
            .in('symbol', mockSymbols);

          /* ------------ Fetch existing trades for duplicate check ------------ */
          setLoadingMessage('Checking for duplicate trades...');
          const existingTrades: {
            datetime: string;
            symbol: string | null;
            side: string | null;
            qty: number | null;
            price: number | null;
            pnl: number | null;
          }[] = [];
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
          const duplicateEntries: UploadSummary['duplicateEntries'] = [];

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

          const uploadSummary: UploadSummary = {
            totalRows: totalParsedRows,
            duplicatesSkipped: duplicateEntries.length,
            newEntriesInserted: newTrades.length,
            fileName: file.name,
            uploadTimestamp,
            duplicateEntries
          };

          /* ------------ If nothing new, just log & notify ------------ */
          if (!newTrades.length) {
            await supabase.from('raw_trade_data').insert({
              user_id: user.id,
              file_name: file.name,
              headers: csvHeaders,
              data: JSON.parse(
                JSON.stringify({ mapping: headerMapping, rows: results.data.slice(0, 10), uploadSummary })
              )
            });
            toast({
              title: 'No New Trades',
              description: `All ${totalParsedRows} entries already exist.`
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
              data: JSON.parse(JSON.stringify({ mapping: headerMapping, rows: results.data, uploadSummary }))
            })
            .select()
            .single();
          if (rawError) throw rawError;

          /* ------------ Metrics & session ------------ */
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

          toast({
            title: 'Upload Complete!',
            description:
              uploadSummary.duplicatesSkipped > 0
                ? `Inserted ${uploadSummary.newEntriesInserted} new trades, skipped ${uploadSummary.duplicatesSkipped} duplicates.`
                : `Inserted ${uploadSummary.newEntriesInserted} trades successfully.`
          });

          setLoadingMessage('');
          window.location.reload();
        } catch (err) {
          console.error('Error processing CSV:', err);
          toast({ title: 'Upload Error', description: (err as Error).message, variant: 'destructive' });
          setLoadingMessage('');
        }
      },
      error: (error) => {
        toast({ title: 'CSV Parsing Error', description: error.message, variant: 'destructive' });
        setLoadingMessage('');
      }
    });
  };

  return { processCsv, loadingMessage };
};
