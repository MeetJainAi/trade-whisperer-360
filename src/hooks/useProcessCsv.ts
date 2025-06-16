
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

// A helper to safely parse numbers from string values
const safeParseFloat = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[^0-9.-]+/g,""));
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

export const useProcessCsv = (journal: Journal) => {
    const { user } = useAuth();
    const [loadingMessage, setLoadingMessage] = useState('');

    const processCsv = async (file: File) => {
        if (!user || !journal.id) {
            toast({ title: "Error", description: "You must be logged in and have a journal selected.", variant: "destructive" });
            return;
        }

        setLoadingMessage('Parsing CSV file...');

        const text = await file.text();

        Papa.parse<CsvRow>(text, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    setLoadingMessage('Validating CSV data...');

                    if (results.errors.length > 0) {
                        console.error("CSV parsing errors:", results.errors);
                        throw new Error(`CSV parsing error on row ${results.errors[0].row}: ${results.errors[0].message}`);
                    }

                    const csvHeaders = results.meta?.fields || [];
                    const csvDataSample = results.data.slice(0, 3);
                    let headerMapping: Record<string, string> = {};

                    try {
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

                    const unique: Record<string, Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>> = {};
                    results.data.forEach((row) => {
                        const datetimeVal = getVal(row, 'datetime') || row.Timestamp || row.Time;
                        if (!datetimeVal) return; // Skip rows without a datetime

                        const trade = {
                            datetime: new Date(datetimeVal as string).toISOString(),
                            symbol: (getVal(row, 'symbol') || row.Symbol) as string | undefined,
                            side: (getVal(row, 'side') || row.Side) as string | undefined,
                            qty: safeParseFloat(getVal(row, 'qty') ?? row.Qty ?? row.Quantity),
                            price: safeParseFloat(getVal(row, 'price') ?? row.Price),
                            pnl: safeParseFloat(getVal(row, 'pnl') ?? row.PnL ?? row['P/L'] ?? row.NetPL),
                            notes: (getVal(row, 'notes') || row.Notes || '') as string,
                        } as Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>;

                        const key = `${trade.datetime}|${trade.symbol}|${trade.side}|${trade.qty}|${trade.price}|${trade.pnl}`;
                        if (!unique[key]) unique[key] = trade;
                    });

                    let tradesToInsert = Object.values(unique);

                    if (tradesToInsert.length === 0) {
                        throw new Error("No valid trades found in the CSV file. Please check column names (e.g., datetime, symbol, pnl).");
                    }

                    const datetimes = tradesToInsert.map(t => t.datetime);
                    const { data: existing, error: existingError } = await supabase
                        .from('trades')
                        .select('id, datetime, symbol, side, qty, price, pnl')
                        .eq('journal_id', journal.id)
                        .in('datetime', datetimes);
                    if (existingError) throw existingError;
                    const existingKeys = new Set(
                        (existing ?? []).map(t => `${t.datetime}|${t.symbol}|${t.side}|${t.qty}|${t.price}|${t.pnl}`)
                    );
                    tradesToInsert = tradesToInsert.filter(
                        t => !existingKeys.has(`${t.datetime}|${t.symbol}|${t.side}|${t.qty}|${t.price}|${t.pnl}`)
                    );

                    if (tradesToInsert.length === 0) {
                        toast({ title: "No New Trades", description: "All trades in this CSV already exist for this account." });
                        setLoadingMessage('');
                        return;
                    }

                    setLoadingMessage('Saving raw file...');
                    const { data: rawData, error: rawError } = await supabase
                        .from('raw_trade_data')
                        .insert({
                            user_id: user.id,
                            file_name: file.name,
                            headers: csvHeaders,
                            data: { mapping: headerMapping, rows: results.data },
                        })
                        .select()
                        .single();
                    if (rawError) throw rawError;

                    setLoadingMessage('Calculating trade metrics...');
                    const metrics = calculateMetrics(tradesToInsert as Trade[]);

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

                    setLoadingMessage(`Inserting ${tradesToInsert.length} trades...`);
                    const tradesData = tradesToInsert.map(trade => ({
                        ...trade,
                        session_id: newSession.id,
                        user_id: user.id,
                        journal_id: journal.id,
                    }));

                    const { error: tradesError } = await supabase.from('trades').insert(tradesData);
                    if (tradesError) throw tradesError;

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

                    toast({ title: "Success!", description: "CSV data uploaded and analyzed." });
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

