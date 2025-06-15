import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import Papa from 'papaparse';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { calculateMetrics } from '@/lib/trade-metrics';
import UploadView from '@/components/AutoJournal/UploadView';
import AnalysisView from '@/components/AutoJournal/AnalysisView';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };
type Journal = Tables<'journals'>;

const REQUIRED_COLUMNS = [
    { id: 'datetime', label: 'Date/Time' },
    { id: 'symbol', label: 'Symbol' },
    { id: 'side', label: 'Side (Buy/Sell)' },
    { id: 'qty', label: 'Quantity' },
    { id: 'price', label: 'Price' },
    { id: 'pnl', label: 'Profit & Loss (P&L)' },
];

const OPTIONAL_COLUMNS = [
    { id: 'notes', label: 'Notes' },
    { id: 'strategy', label: 'Strategy' },
    { id: 'tags', label: 'Tags (comma-separated)' },
    { id: 'image_url', label: 'Image URL' },
];

const cleanAndParseFloat = (value: any): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;
    const stringValue = String(value);
    const isNegative = stringValue.includes('-') || (stringValue.includes('(') && stringValue.includes(')'));
    const numberString = stringValue.replace(/[^0-9.]/g, '');
    if (numberString === '' || numberString === '.') return null;
    let number = parseFloat(numberString);
    if (isNaN(number)) return null;
    if (isNegative && number > 0) number = -number;
    return number;
};

const JournalDetail = () => {
  const { journalId } = useParams<{ journalId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [showUploadView, setShowUploadView] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawFileId, setRawFileId] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');

  const { data: journal, isLoading: isJournalLoading } = useQuery<Journal | null>({
    queryKey: ['journal', journalId],
    queryFn: async () => {
      if (!journalId) return null;
      const { data, error } = await supabase.from('journals').select('*').eq('id', journalId).single();
      if (error) {
        toast({ title: "Error", description: "Could not fetch journal details.", variant: "destructive" });
        navigate('/journals');
        throw error;
      }
      return data;
    },
    enabled: !!journalId,
  });

  const { data: sessions, isLoading: isSessionsLoading } = useQuery({
    queryKey: ['sessions', journalId],
    queryFn: async () => {
      if (!journalId) return [];
      const { data, error } = await supabase.from('trade_sessions').select('*, trades(*)').eq('journal_id', journalId).order('created_at', { ascending: true });
      if (error) throw error;
      return (data as TradeSessionWithTrades[]) || [];
    },
    enabled: !!journalId,
  });

  useEffect(() => {
    if (!isSessionsLoading && (!sessions || sessions.length === 0)) {
      setShowUploadView(true);
    }
  }, [sessions, isSessionsLoading]);

  const allTrades = useMemo(() => sessions?.flatMap(session => session.trades) || [], [sessions]);

  const journalMetricsAndTrades = useMemo(() => {
    if (!sessions || allTrades.length === 0) return null;
    const metrics = calculateMetrics(allTrades);
    return {
      ...metrics,
      id: journalId!,
      created_at: sessions?.[0]?.created_at || new Date().toISOString(),
      user_id: user!.id,
      journal_id: journalId!,
      trades: allTrades,
      ai_strengths: sessions[sessions.length - 1]?.ai_strengths || [],
      ai_mistakes: sessions[sessions.length - 1]?.ai_mistakes || [],
      ai_fixes: sessions[sessions.length - 1]?.ai_fixes || [],
      ai_key_insight: sessions[sessions.length - 1]?.ai_key_insight || null,
    } as unknown as TradeSessionWithTrades;
  }, [allTrades, sessions, journalId, user]);

  const setProcessingState = (isProcessing: boolean, message = '') => {
    setLoadingMessage(message);
  };
  
  const createSessionMutation = useMutation({
    mutationFn: async ({ trades, rawDataId }: { trades: any[], rawDataId?: string }) => {
      if (!user) throw new Error("You must be logged in.");
      if (trades.length === 0) throw new Error("No trades found.");
      if (!journalId) throw new Error("A journal must be selected.");

      setProcessingState(true, 'Checking for duplicate trades...');
      const { data: existingTrades, error: existingTradesError } = await supabase.from('trades').select('datetime, symbol, side, qty, price, pnl').eq('journal_id', journalId).eq('user_id', user.id);
      if (existingTradesError) throw existingTradesError;

      const existingTradeKeys = new Set(existingTrades.map(t => `${new Date(t.datetime).toISOString()}|${t.symbol}|${t.side}|${t.qty}|${t.price}|${Number(t.pnl).toFixed(2)}`));
      const uniqueNewTrades = trades.filter(t => !existingTradeKeys.has(`${new Date(t.datetime).toISOString()}|${t.symbol}|${t.side}|${t.qty}|${t.price}|${Number(t.pnl).toFixed(2)}`));
      
      const duplicatesFound = trades.length - uniqueNewTrades.length;
      if (duplicatesFound > 0) toast({ title: "Duplicates Skipped", description: `${duplicatesFound} trade(s) already existed and were skipped.` });
      if (uniqueNewTrades.length === 0) {
        toast({ title: "No New Trades", description: "All trades from your file already exist in this journal." });
        return null;
      }
      
      setProcessingState(true, 'Analyzing new trades...');
      const metrics = calculateMetrics(uniqueNewTrades);
      const { data: insights, error: insightsError } = await supabase.functions.invoke('analyze-trades', { body: { trades: uniqueNewTrades } });
      if (insightsError) throw new Error(`Failed to get AI insights: ${insightsError.message}`);

      const sessionData: Omit<TablesInsert<'trade_sessions'>, 'user_id'> & { user_id: string } = { user_id: user.id, raw_data_id: rawDataId, journal_id: journalId, ...metrics, ai_strengths: insights.ai_strengths, ai_mistakes: insights.ai_mistakes, ai_fixes: insights.ai_fixes, ai_key_insight: insights.ai_key_insight };
      const { data: newSession, error: sessionError } = await supabase.from('trade_sessions').insert(sessionData).select().single();
      if (sessionError) throw sessionError;

      setProcessingState(true, 'Saving new trades...');
      const tradesData = uniqueNewTrades.map(trade => ({ ...trade, session_id: newSession.id, user_id: user.id, datetime: new Date(trade.datetime).toISOString(), journal_id: journalId }));
      const { error: tradesError } = await supabase.from('trades').insert(tradesData);
      if (tradesError) throw tradesError;
      
      return { ...newSession, trades: tradesData } as TradeSessionWithTrades;
    },
    onSuccess: (data) => {
      if (data) {
        setShowUploadView(false);
        queryClient.invalidateQueries({ queryKey: ['sessions', journalId] });
        toast({ title: "Success!", description: "Your trade session has been analyzed." });
      }
      setCsvData([]); setCsvHeaders([]); setRawFileId(null);
      setProcessingState(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setProcessingState(false);
    },
  });

  const mapColumnsMutation = useMutation({
    mutationFn: async ({ csvHeaders, csvDataSample }: { csvHeaders: string[]; csvDataSample: any[] }) => {
      setProcessingState(true, 'Asking AI to map columns...');
      const { data, error } = await supabase.functions.invoke('map-columns-with-gemini', { body: { csvHeaders, csvDataSample } });
      if (error) throw new Error(`Failed to get mapping from AI: ${error.message}`);
      return data.mapping;
    },
    onSuccess: (mapping) => {
        const missingColumns = REQUIRED_COLUMNS.filter(col => !mapping[col.id]);
        if (missingColumns.length > 0) {
            toast({ title: "AI Mapping Incomplete", description: `AI could not map required fields: ${missingColumns.map(c => c.label).join(', ')}.`, variant: "destructive"});
            setProcessingState(false);
            return;
        }

        const mappedData = csvData.map(row => {
            const newRow: { [key: string]: any } = {};
            [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].forEach(col => {
                if (mapping[col.id] && row[mapping[col.id]] !== undefined) {
                    const rawValue = row[mapping[col.id]];
                    if (['pnl', 'qty', 'price'].includes(col.id)) newRow[col.id] = cleanAndParseFloat(rawValue);
                    else if (col.id === 'tags') newRow[col.id] = String(rawValue).split(',').map(t => t.trim()).filter(Boolean);
                    else newRow[col.id] = rawValue;
                }
            });
            if (!newRow.notes) newRow.notes = '';
            return newRow;
        });
        
        const validatedData = mappedData.filter(trade => trade.pnl !== null && trade.qty !== null && trade.price !== null && trade.datetime && String(trade.datetime).trim() !== '');
        if (validatedData.length === 0) {
            toast({ title: "No Valid Trades Found", description: "Check your file for missing/invalid values in required columns.", variant: "destructive" });
            setProcessingState(false);
            return;
        }

        if (validatedData.length < mappedData.length) toast({ title: "Some trades skipped", description: `${mappedData.length - validatedData.length} rows were skipped due to missing required data.` });
        if (!rawFileId) {
            toast({ title: "Error", description: "Could not find raw file reference.", variant: "destructive" });
            setProcessingState(false);
            return;
        }
        createSessionMutation.mutate({ trades: validatedData, rawDataId: rawFileId });
    },
    onError: (error: any) => {
      toast({ title: "AI Mapping Failed", description: `${error.message}.`, variant: "destructive" });
      setProcessingState(false);
    },
  });

  const validateCsvMutation = useMutation({
    mutationFn: async ({ csvHeaders, csvDataSample }: { csvHeaders: string[]; csvDataSample: any[] }) => {
      setProcessingState(true, 'Verifying file content...');
      const { data, error } = await supabase.functions.invoke('validate-csv-content', { body: { csvHeaders, csvDataSample } });
      if (error) { console.warn(`AI validation failed: ${error.message}. Proceeding to mapping anyway.`); return { is_trading_related: true }; }
      if (!data.is_trading_related) throw new Error("The file does not appear to contain trading data.");
      return data;
    },
    onSuccess: (_, variables) => mapColumnsMutation.mutate(variables),
    onError: (error: any) => {
        toast({ title: "Invalid File", description: error.message, variant: "destructive" });
        setProcessingState(false);
    },
  });

  const saveRawDataMutation = useMutation({
    mutationFn: async ({ file, headers, data }: { file: File; headers: string[]; data: any[] }) => {
      if (!user) throw new Error("You must be logged in.");
      setProcessingState(true, 'Saving raw file...');
      const { data: rawData, error } = await supabase.from('raw_trade_data').insert({ user_id: user.id, file_name: file.name, headers: headers, data: data as any }).select().single();
      if (error) throw error;
      return rawData;
    },
    onSuccess: (rawData, variables) => {
      setRawFileId(rawData.id);
      validateCsvMutation.mutate({ csvHeaders: variables.headers, csvDataSample: (variables.data as any[]).slice(0, 3) });
    },
    onError: (error: any) => {
      toast({ title: "Error saving raw file", description: error.message, variant: "destructive" });
      setProcessingState(false);
    }
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && journalId) {
      setProcessingState(true, 'Parsing CSV file...');
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.meta.fields || results.meta.fields.length === 0) { toast({ title: "Invalid CSV", description: "Could not read headers.", variant: "destructive" }); setProcessingState(false); return; }
          if (results.data.length === 0) { toast({ title: "Empty File", description: "No trade data found.", variant: "destructive" }); setProcessingState(false); return; }
          setCsvData(results.data as any[]);
          setCsvHeaders(results.meta.fields);
          saveRawDataMutation.mutate({ file, headers: results.meta.fields, data: results.data as any[] });
        },
        error: (error: any) => { toast({ title: "CSV Parsing Error", description: error.message, variant: "destructive" }); setProcessingState(false); }
      });
    }
  };
  
  const handleUseSampleData = () => {
    const sampleTrades = [
        { datetime: '2024-01-15 09:30:00', symbol: 'AAPL', side: 'BUY', qty: 100, price: 150.25, pnl: 45.00, notes: 'Breakout' },
        { datetime: '2024-01-15 10:15:00', symbol: 'TSLA', side: 'SELL', qty: 50, price: 245.80, pnl: -30.00, notes: 'Stop loss hit' },
        { datetime: '2024-01-15 11:00:00', symbol: 'GOOG', side: 'BUY', qty: 20, price: 140.00, pnl: 55.00, notes: '' },
    ];
    createSessionMutation.mutate({ trades: sampleTrades });
  };
  
  const isCurrentlyProcessing = createSessionMutation.isPending || mapColumnsMutation.isPending || validateCsvMutation.isPending || saveRawDataMutation.isPending;

  if (isJournalLoading || isSessionsLoading) {
    return <div className="flex items-center justify-center h-screen"><p>Loading journal...</p></div>;
  }

  if (showUploadView || !journalMetricsAndTrades) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => navigate('/journals')}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{journal?.name}</h1>
            <p className="text-muted-foreground">Upload your first trade history file to get started.</p>
          </div>
        </div>
        <div className="flex-grow flex items-center justify-center">
            <Card className="w-full max-w-lg">
                <CardHeader><CardTitle>Upload Trades</CardTitle><CardDescription>Upload a CSV file to analyze your trades.</CardDescription></CardHeader>
                <CardContent>
                    <UploadView
                        handleFileUpload={handleFileUpload}
                        handleUseSampleData={handleUseSampleData}
                        isLoading={isCurrentlyProcessing}
                        statusText={loadingMessage || 'Choose CSV file'}
                    />
                </CardContent>
            </Card>
        </div>
      </div>
    );
  }

  return <AnalysisView currentSession={journalMetricsAndTrades} onUploadNew={() => setShowUploadView(true)} />;
};

export default JournalDetail;
