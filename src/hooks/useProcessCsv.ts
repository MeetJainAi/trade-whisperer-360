import { useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/components/AuthProvider';
import { calculateMetrics } from '@/lib/trade-metrics';

type Trade = Tables<'trades'>;
type Journal = Tables<'journals'>;
type ProcessedTrade = Omit<TablesInsert<'trades'>, 'user_id' | 'journal_id' | 'session_id'>;

interface CsvRow {
  [key: string]: string | number | undefined;
}

const safeParseFloat = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        let cleanValue = value.trim();
        if (!cleanValue) return 0;

        let isNegative = false;
        if (cleanValue.startsWith('(') && cleanValue.endsWith(')')) {
            isNegative = true;
            cleanValue = cleanValue.substring(1, cleanValue.length - 1);
        }
        if (cleanValue.startsWith('-')) {
            isNegative = true;
            cleanValue = cleanValue.substring(1);
        } else if (cleanValue.endsWith('-')) {
            isNegative = true;
            cleanValue = cleanValue.slice(0, -1);
        }

        cleanValue = cleanValue.replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleanValue);
        const result = isNaN(parsed) ? 0 : parsed;

        return isNegative ? -Math.abs(result) : result;
    }
    return 0;
};

/**
 * Normalizes a trade object to a consistent format for reliable key generation.
 * This is the key to ensuring new and existing trades are compared accurately.
 */
const normalizeTrade = (trade: Partial<Trade>): ProcessedTrade => {
    return {
        datetime: new Date(trade.datetime!).toISOString(),
        symbol: (trade.symbol || '').toString().toUpperCase().trim(),
        side: (trade.side || '').toString().toUpperCase().trim(),
        qty: safeParseFloat(trade.qty),
        price: safeParseFloat(trade.price),
        pnl: safeParseFloat(trade.pnl),
        notes: (trade.notes || '').trim() || null,
        strategy: (trade as any).strategy || null,
        tags: (trade as any).tags || null,
        image_url: (trade as any).image_url || null,
    };
};

/**
 * Creates a robust composite key from a normalized trade object.
 */
const createCompositeKey = (trade: ProcessedTrade): string => {
    const formatNumber = (n: number | null | undefined) => (n ? n.toFixed(4) : '0.0000');
    
    return [
        trade.datetime,
        trade.symbol,
        trade.side,
        formatNumber(trade.qty),
        formatNumber(trade.price),
        formatNumber(trade.pnl)
    ].join('|');
};

export const useProcessCsv = (journal: Journal) => {
    const { user } = useAuth();
    const [loadingMessage, setLoadingMessage] = useState('');

    const processCsv = async (file: File) => {
        if (!user || !journal.id) {
            toast({ title: 'Error', description: 'Authentication or journal issue.', variant: 'destructive' });
            return;
        }

        setLoadingMessage('Parsing CSV file...');
        const text = await file.text();

        Papa.parse<CsvRow>(text, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    if (results.errors.length) throw new Error(`CSV parsing error: ${results.errors[0].message}`);

                    const csvHeaders = results.meta?.fields || [];
                    const csvDataSample = results.data.slice(0, 3);
                    
                    setLoadingMessage('Validating and mapping columns with AI...');
                    const { data: mappingData, error: mappingError } = await supabase.functions.invoke<{ mapping: Record<string, string> }>('map-columns-with-gemini', { body: { csvHeaders, csvDataSample } });
                    if (mappingError) throw mappingError;
                    
                    const headerMapping = mappingData?.mapping || {};
                    console.log('✅ AI Column Mapping:', headerMapping);

                    const getVal = (row: CsvRow, key: string) => headerMapping[key] ? row[headerMapping[key]] : undefined;

                    setLoadingMessage('Normalizing and processing trades...');
                    const uniqueTradesInFile = new Map<string, ProcessedTrade>();
                    results.data.forEach(row => {
                        const datetimeVal = getVal(row, 'datetime');
                        if (!datetimeVal) return;

                        const normalized = normalizeTrade({
                            datetime: new Date(datetimeVal as string).toISOString(),
                            symbol: getVal(row, 'symbol') as string,
                            side: getVal(row, 'side') as string,
                            qty: getVal(row, 'qty') as number,
                            price: getVal(row, 'price') as number,
                            pnl: getVal(row, 'pnl') as number,
                            notes: getVal(row, 'notes') as string,
                        });
                        
                        if (normalized.symbol) {
                            const key = createCompositeKey(normalized);
                            if (!uniqueTradesInFile.has(key)) {
                                uniqueTradesInFile.set(key, normalized);
                            }
                        }
                    });

                    const tradesToProcess = Array.from(uniqueTradesInFile.values());
                    if (tradesToProcess.length === 0) throw new Error('No valid trades found in the CSV file.');

                    setLoadingMessage('Fetching existing trades for duplicate check...');
                    const { data: existingTrades, error: fetchError } = await supabase
                        .from('trades')
                        .select('datetime,symbol,side,qty,price,pnl,notes,strategy,tags,image_url')
                        .eq('journal_id', journal.id);

                    if (fetchError) throw fetchError;

                    const existingKeys = new Set(existingTrades.map(t => createCompositeKey(normalizeTrade(t))));
                    console.log(`🔑 Found ${existingKeys.size} existing trade keys in the database.`);

                    const newTrades: ProcessedTrade[] = [];
                    let duplicatesSkipped = 0;
                    
                    tradesToProcess.forEach(trade => {
                        const key = createCompositeKey(trade);
                        if (existingKeys.has(key)) {
                            console.log(`🚫 Duplicate SKIPPED: ${key}`);
                            duplicatesSkipped++;
                        } else {
                            newTrades.push(trade);
                        }
                    });

                    console.log(`📊 Processing complete. New Trades: ${newTrades.length}, Duplicates Skipped: ${duplicatesSkipped}`);

                    if (newTrades.length === 0) {
                        toast({
                            title: 'No New Trades',
                            description: `All ${duplicatesSkipped} trades from this file already exist in your journal.`,
                            variant: 'default',
                        });
                        setLoadingMessage('');
                        return;
                    }
                    
                    setLoadingMessage(`Creating session for ${newTrades.length} new trades...`);
                    const metrics = calculateMetrics(newTrades as Trade[]);
                    const { data: newSession, error: sessionError } = await supabase
                        .from('trade_sessions').insert({ journal_id: journal.id, user_id: user.id, ...metrics }).select().single();
                    if (sessionError) throw sessionError;

                    const tradesToInsert = newTrades.map(t => ({ ...t, session_id: newSession.id, user_id: user.id, journal_id: journal.id }));
                    const { error: tradesError } = await supabase.from('trades').insert(tradesToInsert);
                    if (tradesError) throw tradesError;

                    try {
                        setLoadingMessage('Generating AI insights...');
                        const { data: insights } = await supabase.functions.invoke<Partial<Tables<'trade_sessions'>>>('analyze-trades', { body: { trades: tradesToInsert.slice(0, 100) } });
                        if (insights) await supabase.from('trade_sessions').update(insights).eq('id', newSession.id);
                    } catch (err) {
                        console.warn('⚠️ AI insights failed:', err);
                    }

                    toast({
                        title: 'Upload Successful!',
                        description: `Added ${newTrades.length} new trades. Skipped ${duplicatesSkipped} duplicates.`,
                    });
                    
                    setLoadingMessage('');
                    window.location.reload();

                } catch (err) {
                    console.error('❌ Full processing error:', err);
                    toast({ title: 'Upload Failed', description: (err as Error).message, variant: 'destructive' });
                    setLoadingMessage('');
                }
            }
        });
    };

    return { processCsv, loadingMessage };
};