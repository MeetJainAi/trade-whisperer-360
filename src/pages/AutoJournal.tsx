
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useMutation } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import Papa from 'papaparse';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { calculateMetrics } from '@/lib/trade-metrics';
import UploadView from '@/components/AutoJournal/UploadView';
import ColumnMappingView from '@/components/AutoJournal/ColumnMappingView';
import AnalysisView from '@/components/AutoJournal/AnalysisView';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };

const AutoJournal = () => {
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState<TradeSessionWithTrades | null>(null);
  const [uploadStep, setUploadStep] = useState<'upload' | 'map'>('upload');
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [initialMapping, setInitialMapping] = useState<{ [key: string]: string }>({});
  const [isMappingLoading, setIsMappingLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const createSessionMutation = useMutation({
    mutationFn: async (trades: any[]) => {
      if (!user) throw new Error("You must be logged in to create a session.");
      if (trades.length === 0) throw new Error("No trades found in the file.");

      const metrics = calculateMetrics(trades);

      const { data: insights, error: insightsError } = await supabase.functions.invoke('analyze-trades', {
        body: { trades },
      });
      if (insightsError) throw new Error(`Failed to get AI insights: ${insightsError.message}`);

      const sessionData: Omit<TablesInsert<'trade_sessions'>, 'user_id'> & { user_id: string } = {
        user_id: user.id,
        total_pnl: metrics.total_pnl,
        total_trades: metrics.total_trades,
        win_rate: metrics.win_rate,
        avg_win: metrics.avg_win,
        avg_loss: metrics.avg_loss,
        max_drawdown: metrics.max_drawdown,
        equity_curve: metrics.equity_curve as any,
        time_data: metrics.time_data as any,
        ai_strengths: insights.ai_strengths,
        ai_mistakes: insights.ai_mistakes,
        ai_fixes: insights.ai_fixes,
        ai_key_insight: insights.ai_key_insight,
      };

      const { data: newSession, error: sessionError } = await supabase
        .from('trade_sessions')
        .insert(sessionData)
        .select()
        .single();
      
      if (sessionError) throw sessionError;

      const tradesData = trades.map(trade => ({
        ...trade,
        session_id: newSession.id,
        user_id: user.id,
        datetime: new Date(trade.datetime).toISOString(),
      }));

      const { error: tradesError } = await supabase.from('trades').insert(tradesData);
      if (tradesError) throw tradesError;
      
      return { ...newSession, trades: tradesData } as TradeSessionWithTrades;
    },
    onSuccess: (data) => {
      setCurrentSession(data);
      setUploadStep('upload');
      setCsvData([]);
      setCsvHeaders([]);
      toast({ title: "Success!", description: "Your trade session has been analyzed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const mapColumnsMutation = useMutation({
    mutationFn: async ({ csvHeaders, csvDataSample }: { csvHeaders: string[]; csvDataSample: any[] }) => {
      setLoadingMessage('Asking AI to map columns...');
      const { data, error } = await supabase.functions.invoke('map-columns-with-gemini', {
        body: { csvHeaders, csvDataSample },
      });

      if (error) {
        throw new Error(`Failed to get mapping from AI: ${error.message}`);
      }
      return data.mapping;
    },
    onSuccess: (mapping) => {
      setInitialMapping(mapping);
      setUploadStep('map');
    },
    onError: (error: any) => {
      toast({
        title: "AI Mapping Failed",
        description: `${error.message}. We'll proceed with basic mapping. You can correct it manually.`,
        variant: "destructive"
      });
      // Fallback to basic mapping if AI fails
      setInitialMapping({});
      setUploadStep('map');
    },
    onSettled: () => {
      setIsMappingLoading(false);
      setLoadingMessage('');
    }
  });

  const validateCsvMutation = useMutation({
    mutationFn: async ({ csvHeaders, csvDataSample }: { csvHeaders: string[]; csvDataSample: any[] }) => {
      setLoadingMessage('Verifying file content with AI...');
      const { data, error } = await supabase.functions.invoke('validate-csv-content', {
        body: { csvHeaders, csvDataSample },
      });

      if (error) {
        console.warn(`AI validation failed: ${error.message}. Proceeding to mapping anyway.`);
        return { is_trading_related: true };
      }
      
      if (!data.is_trading_related) {
        throw new Error("The uploaded file does not appear to contain trading data. Please upload a valid trades CSV.");
      }

      return data;
    },
    onSuccess: (_, variables) => {
        mapColumnsMutation.mutate(variables);
    },
    onError: (error: any) => {
        toast({
            title: "Invalid File",
            description: error.message,
            variant: "destructive"
        });
        setIsMappingLoading(false);
        setLoadingMessage('');
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsMappingLoading(true);
      setLoadingMessage('Parsing CSV file...');
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.meta.fields || results.meta.fields.length === 0) {
            toast({ title: "Invalid CSV", description: "Could not read headers from the file.", variant: "destructive" });
            setIsMappingLoading(false);
            setLoadingMessage('');
            return;
          }
          if (results.data.length === 0) {
            toast({ title: "Empty File", description: "No trade data found in the CSV.", variant: "destructive" });
            setIsMappingLoading(false);
            setLoadingMessage('');
            return;
          }
          const headers = results.meta.fields;
          const data = results.data as any[];
          setCsvData(data);
          setCsvHeaders(headers);
          
          const sampleData = data.slice(0, 3);
          validateCsvMutation.mutate({ csvHeaders: headers, csvDataSample: sampleData });
        },
        error: (error: any) => {
            toast({ title: "CSV Parsing Error", description: error.message, variant: "destructive" });
            setIsMappingLoading(false);
            setLoadingMessage('');
        }
      });
    }
  };

  const handleMapComplete = (mappedData: any[]) => {
      createSessionMutation.mutate(mappedData);
  }

  const handleCancelMapping = () => {
      setUploadStep('upload');
      setCsvData([]);
      setCsvHeaders([]);
  }
  
  const handleUseSampleData = () => {
    const sampleTrades = [
        { datetime: '2024-01-15 09:30:00', symbol: 'AAPL', side: 'BUY', qty: 100, price: 150.25, pnl: 45.00, notes: 'Breakout' },
        { datetime: '2024-01-15 09:45:00', symbol: 'AAPL', side: 'SELL', qty: 100, price: 150.70, pnl: 45.00, notes: 'Took profit' },
        { datetime: '2024-01-15 10:15:00', symbol: 'TSLA', side: 'SELL', qty: 50, price: 245.80, pnl: -30.00, notes: 'Stop loss hit' },
        { datetime: '2024-01-15 10:30:00', symbol: 'GOOG', side: 'BUY', qty: 20, price: 140.00, pnl: 55.00, notes: '' },
        { datetime: '2024-01-15 11:00:00', symbol: 'GOOG', side: 'SELL', qty: 20, price: 142.75, pnl: 55.00, notes: '' },
        { datetime: '2024-01-15 11:30:00', symbol: 'MSFT', side: 'BUY', qty: 50, price: 390.00, pnl: -35.00, notes: 'Faked out' },
    ];
    createSessionMutation.mutate(sampleTrades);
  };

  const handleUploadNew = () => {
    setCurrentSession(null);
    setUploadStep('upload');
    setCsvData([]);
    setCsvHeaders([]);
    setInitialMapping({});
  }

  if (currentSession) {
    return <AnalysisView currentSession={currentSession} onUploadNew={handleUploadNew} />;
  }

  if (uploadStep === 'map') {
    return (
      <ColumnMappingView
        csvHeaders={csvHeaders}
        csvData={csvData}
        onMapComplete={handleMapComplete}
        onCancel={handleCancelMapping}
        isProcessing={createSessionMutation.isPending}
        initialMapping={initialMapping}
      />
    );
  }

  return (
    <UploadView
      handleFileUpload={handleFileUpload}
      handleUseSampleData={handleUseSampleData}
      isLoading={isMappingLoading || createSessionMutation.isPending}
      statusText={
        isMappingLoading ? loadingMessage :
        createSessionMutation.isPending ? 'Processing...' :
        'Choose CSV file'
      }
    />
  );
};

export default AutoJournal;
