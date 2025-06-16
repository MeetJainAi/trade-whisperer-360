
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

// Make UploadSummary compatible with Json type by making it serializable
interface UploadSummary {
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

const safeParseFloat = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""));
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const createCompositeKey = (trade: Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>): string => {
  return `${trade.datetime}|${trade.symbol}|${trade.side}|${trade.qty}|${trade.price}|${trade.pnl}`;
};

export const useProcessCsv = (journal: Journal) => {
  const { user } = useAuth();
  const [loadingMessage, setLoadingMessage] = useState('');

  const processCsv = async (file: File) => {
    if (!user || !journal.id) {
      toast({ title: "Error", description: "You must be logged in and have a journal selected.", variant: "destructive" });
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
          if (results.errors.length > 0) {
            console.error("CSV parsing errors:", results.errors);
            throw new Error(`CSV parsing error on row ${results.errors[0].row}: ${results.errors[0].message}`);
          }

          const csvHeaders = results.meta?.fields || [];
          const csvDataSample = results.data.slice(0, 3);
          let headerMapping: Record<string, string> = {};

          // Validate the file content
          try {
            setLoadingMessage('Validating CSV data...');
            const { data: validationData, error: validationError } = await supabase.functions.invoke<
              { is_trading_related: boolean }
            >('validate-csv-content', {
              body: { csvHeaders, csvDataSample },
            });
            if (validationError) throw validationError;
            if (!validationData?.is_trading_related) {
              throw new Error('The uploaded CSV does not appear to contain trading data.');
            }
          } catch (err) {
            console.error('CSV validation failed:', err);
            throw err;
          }

          // Map columns using Gemini
          try {
            setLoadingMessage('Mapping CSV columns...');
            const { data: mappingData, error: mappingError } = await supabase.functions.invoke<
              { mapping: Record<string, string> }
            >('map-columns-with-gemini', {
              body: { csvHeaders, csvDataSample },
            });
            if (mappingError) throw mappingError;
            headerMapping = mappingData?.mapping || {};
          } catch (err) {
            console.warn('Column mapping failed, using best-effort mapping.', err);
          }

          const getVal = (row: CsvRow, key: string): string | number | undefined => {
            const header = headerMapping[key];
            return row[key] ?? (header ? row[header] : undefined);
          };

          // Parse and deduplicate trades from CSV
          setLoadingMessage('Processing trade data...');
          const unique: Record<string, Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>> = {};
          results.data.forEach((row) => {
            const datetimeVal = getVal(row, 'datetime') || row.Timestamp || row.Time;
            if (!datetimeVal) return;

            const trade = {
              datetime: new Date(datetimeVal as string).toISOString(),
              symbol: (getVal(row, 'symbol') || row.Symbol) as string | undefined,
              side: (getVal(row, 'side') || row.Side) as string | undefined,
              qty: safeParseFloat(getVal(row, 'qty') ?? row.Qty ?? row.Quantity),
              price: safeParseFloat(getVal(row, 'price') ?? row.Price),
              pnl: safeParseFloat(getVal(row, 'pnl') ?? row.PnL ?? row['P/L'] ?? row.NetPL),
              notes: (getVal(row, 'notes') || row.Notes || '') as string,
            };

            const key = createCompositeKey(trade);
            if (!unique[key]) unique[key] = trade;
          });

          let tradesToProcess = Object.values(unique);
          const totalParsedRows = tradesToProcess.length;

          if (tradesToProcess.length === 0) {
            throw new Error("No valid trades found in the CSV file. Please check column names (e.g., datetime, symbol, pnl).");
          }

          console.log(`Parsed ${totalParsedRows} unique trades from CSV`);

          // Check for existing trades in database
          setLoadingMessage('Checking for duplicate trades...');
          const datetimes = tradesToProcess.map(t => t.datetime);
          const { data: existing, error: existingError } = await supabase
            .from('trades')
            .select('datetime, symbol, side, qty, price, pnl')
            .eq('journal_id', journal.id)
            .in('datetime', datetimes);

          if (existingError) throw existingError;

          // Create set of existing trade keys for faster lookup
          const existingKeys = new Set(
            (existing ?? []).map(t => createCompositeKey({
              datetime: t.datetime,
              symbol: t.symbol,
              side: t.side,
              qty: t.qty,
              price: t.price,
              pnl: t.pnl,
              notes: null
            }))
          );

          // Separate new trades from duplicates
          const newTrades: typeof tradesToProcess = [];
          const duplicateEntries: UploadSummary['duplicateEntries'] = [];

          tradesToProcess.forEach(trade => {
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

          const duplicatesSkipped = duplicateEntries.length;
          const newEntriesCount = newTrades.length;

          console.log(`Upload summary: ${totalParsedRows} total, ${duplicatesSkipped} duplicates, ${newEntriesCount} new`);

          // Handle case where all trades are duplicates
          if (newTrades.length === 0) {
            const uploadSummary: UploadSummary = {
              totalRows: totalParsedRows,
              duplicatesSkipped,
              newEntriesInserted: 0,
              fileName: file.name,
              uploadTimestamp,
              duplicateEntries
            };

            // Log the upload attempt - serialize the data properly for Json type
            const rawDataToInsert = {
              user_id: user.id,
              file_name: file.name,
              headers: csvHeaders,
              data: JSON.parse(JSON.stringify({ 
                mapping: headerMapping, 
                rows: results.data.slice(0, 10), // Store first 10 rows for reference
                uploadSummary 
              }))
            };

            await supabase.from('raw_trade_data').insert(rawDataToInsert);

            console.log('All trades were duplicates:', uploadSummary);
            toast({ 
              title: "No New Trades", 
              description: `All ${totalParsedRows} entries already exist for this journal. No duplicates were added.`
            });
            setLoadingMessage('');
            return;
          }

          // Save raw file data
          setLoadingMessage('Saving raw file data...');
          const uploadSummary: UploadSummary = {
            totalRows: totalParsedRows,
            duplicatesSkipped,
            newEntriesInserted: newEntriesCount,
            fileName: file.name,
            uploadTimestamp,
            duplicateEntries
          };

          // Serialize the data properly for Json type
          const rawDataToInsert = {
            user_id: user.id,
            file_name: file.name,
            headers: csvHeaders,
            data: JSON.parse(JSON.stringify({ 
              mapping: headerMapping, 
              rows: results.data,
              uploadSummary
            }))
          };

          const { data: rawData, error: rawError } = await supabase
            .from('raw_trade_data')
            .insert(rawDataToInsert)
            .select()
            .single();

          if (rawError) throw rawError;

          // Calculate metrics for new trades only
          setLoadingMessage('Calculating trade metrics...');
          const metrics = calculateMetrics(newTrades as Trade[]);

          setLoadingMessage('Creating new trade session...');
          const sessionData = {
            journal_id: journal.id,
            user_id: user.id,
            total_trades: metrics.total_trades,
            total_pnl: metrics.total_pnl,
            win_rate: metrics.win_rate,
            profit_factor: metrics.profit_factor,
            max_drawdown: metrics.max_drawdown,
            avg_win: metrics.avg_win,
            avg_loss: metrics.avg_loss,
            equity_curve: metrics.equity_curve,
            time_data: metrics.time_data,
            trades_by_day: metrics.trades_by_day,
            trades_by_symbol: metrics.trades_by_symbol,
            raw_data_id: rawData.id,
          };

          const { data: newSession, error: sessionError } = await supabase
            .from('trade_sessions')
            .insert(sessionData)
            .select()
            .single();

          if (sessionError) throw sessionError;

          // Insert new trades
          setLoadingMessage(`Inserting ${newTrades.length} new trades...`);
          const tradesData = newTrades.map(trade => ({
            ...trade,
            session_id: newSession.id,
            user_id: user.id,
            journal_id: journal.id,
          }));

          const { error: tradesError } = await supabase.from('trades').insert(tradesData);
          if (tradesError) throw tradesError;

          // Generate AI insights for new trades
          try {
            setLoadingMessage('Generating AI insights...');
            const { data: insights, error: insightsError } = await supabase.functions.invoke<
              Partial<Tables<'trade_sessions'>>
            >('analyze-trades', {
              body: { trades: tradesData.slice(0, 100) },
            });
            if (!insightsError && insights) {
              await supabase.from('trade_sessions').update(insights).eq('id', newSession.id);
            }
          } catch (err) {
            console.warn('Failed to generate AI insights:', err);
          }

          // Log successful upload summary
          console.log('Upload completed successfully:', uploadSummary);
          
          // Show success message with summary
          const summaryMessage = duplicatesSkipped > 0 
            ? `Successfully uploaded ${newEntriesCount} new trades. ${duplicatesSkipped} duplicate entries were skipped.`
            : `Successfully uploaded ${newEntriesCount} trades.`;

          toast({ 
            title: "Upload Complete!", 
            description: summaryMessage 
          });
          
          setLoadingMessage('');
          window.location.reload();

        } catch (error) {
          const err = error as Error;
          console.error('Error processing CSV:', err);
          toast({ title: "Upload Error", description: err.message, variant: "destructive" });
          setLoadingMessage('');
        }
      },
      error: (error) => {
        const err = error as Error;
        console.error('Error parsing CSV:', err);
        toast({ title: "CSV Parsing Error", description: err.message, variant: "destructive" });
        setLoadingMessage('');
      }
    });
  };

  return { processCsv, loadingMessage };
};
