
import { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/components/AuthProvider';
import { calculateMetrics } from '@/lib/trade-metrics';

type Trade = Tables<'trades'>;
type Journal = Tables<'journals'>;

// A helper to safely parse numbers from string values
const safeParseFloat = (value: any): number => {
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

        Papa.parse(text, {
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
                    const csvDataSample = (results.data as any[]).slice(0, 3);
                    let headerMapping: Record<string, string> = {};

                    try {
                        const { data: validationData, error: validationError } = await supabase.functions.invoke('validate-csv-content', {
                            body: { csvHeaders, csvDataSample },
                        });
                        if (validationError) throw validationError;
                        if (!(validationData as any)?.is_trading_related) {
                            throw new Error('The uploaded CSV does not appear to contain trading data.');
                        }
                    } catch (err) {
                        console.error('CSV validation failed:', err);
                        throw err;
                    }

                    try {
                        setLoadingMessage('Mapping CSV columns...');
                        const { data: mappingData, error: mappingError } = await supabase.functions.invoke('map-columns-with-gemini', {
                            body: { csvHeaders, csvDataSample },
                        });
                        if (mappingError) throw mappingError;
                        headerMapping = (mappingData as any)?.mapping || {};
                    } catch (err) {
                        console.warn('Column mapping failed, using best-effort mapping.', err);
                    }

                    const getVal = (row: any, key: string) => {
                        const header = headerMapping[key];
                        return row[key] ?? (header ? row[header] : undefined);
                    };

                    let tradesToInsert: Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>[] = (results.data as any[])
                        .map((row: any) => {
                            const datetimeVal = getVal(row, 'datetime') || row.Timestamp || row.Time;
                            if (!datetimeVal) return null; // Skip rows without a datetime

                            return {
                                datetime: new Date(datetimeVal).toISOString(),
                                symbol: getVal(row, 'symbol') || row.Symbol,
                                side: getVal(row, 'side') || row.Side,
                                qty: safeParseFloat(getVal(row, 'qty') ?? row.Qty ?? row.Quantity),
                                price: safeParseFloat(getVal(row, 'price') ?? row.Price),
                                pnl: safeParseFloat(getVal(row, 'pnl') ?? row.PnL ?? row['P/L'] ?? row.NetPL),
                                notes: (getVal(row, 'notes') || row.Notes || '') as string,
                            };
                        })
                        .filter(Boolean) as Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>[];

                    if (tradesToInsert.length === 0) {
                        throw new Error("No valid trades found in the CSV file. Please check column names (e.g., datetime, symbol, pnl).");
                    }

                    const datetimes = tradesToInsert.map(t => t.datetime);
                    const { data: existing, error: existingError } = await supabase
                        .from('trades')
                        .select('datetime')
                        .eq('journal_id', journal.id)
                        .in('datetime', datetimes);
                    if (existingError) throw existingError;
                    const existingSet = new Set(existing?.map(t => t.datetime));
                    tradesToInsert = tradesToInsert.filter(t => !existingSet.has(t.datetime));

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
                        const { data: insights, error: insightsError } = await supabase.functions.invoke('analyze-trades', {
                            body: { trades: tradesData.slice(0, 100) },
                        });
                        if (!insightsError && insights) {
                            await supabase.from('trade_sessions').update(insights as any).eq('id', newSession.id);
                        }
                    } catch (err) {
                        console.warn('Failed to generate AI insights:', err);
                    }

                    toast({ title: "Success!", description: "CSV data uploaded and analyzed." });
                    setLoadingMessage('');
                    window.location.reload();
                } catch (error: any) {
                    console.error('Error processing CSV:', error);
                    toast({ title: "Upload Error", description: error.message, variant: "destructive" });
                    setLoadingMessage('');
                }
            },
            error: (error: any) => {
                console.error('Error parsing CSV:', error);
                toast({ title: "CSV Parsing Error", description: error.message, variant: "destructive" });
                setLoadingMessage('');
            }
        });
    };

    return { processCsv, loadingMessage };
};

