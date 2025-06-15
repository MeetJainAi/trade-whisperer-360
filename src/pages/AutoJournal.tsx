import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useMutation } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import Papa from 'papaparse';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { calculateMetrics } from '@/lib/trade-metrics';
import UploadView from '@/components/AutoJournal/UploadView';
import AnalysisView from '@/components/AutoJournal/AnalysisView';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };

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
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'number') {
        return value;
    }
    let stringValue = String(value).trim();

    // Handle parentheses for negative numbers e.g. (50.00)
    if (stringValue.startsWith('(') && stringValue.endsWith(')')) {
        stringValue = '-' + stringValue.substring(1, stringValue.length - 1);
    }
    
    // Remove characters that are not digits, decimal point, or minus sign.
    const cleanedString = stringValue.replace(/[^0-9.-]/g, '');
    
    if (cleanedString === '' || cleanedString === '-' || cleanedString === '.') {
        return null;
    }

    const number = parseFloat(cleanedString);
    
    return isNaN(number) ? null : number;
};

const AutoJournal = () => {
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState<TradeSessionWithTrades | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawFileId, setRawFileId] = useState<string | null>(null);
  const [isMappingLoading, setIsMappingLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const createSessionMutation = useMutation({
    mutationFn: async ({ trades, rawDataId }: { trades: any[], rawDataId?: string }) => {
      if (!user) throw new Error("You must be logged in to create a session.");
      if (trades.length === 0) throw new Error("No trades found in the file.");

      const metrics = calculateMetrics(trades);

      const { data: insights, error: insightsError } = await supabase.functions.invoke('analyze-trades', {
        body: { trades },
      });
      if (insightsError) throw new Error(`Failed to get AI insights: ${insightsError.message}`);

      const sessionData: Omit<TablesInsert<'trade_sessions'>, 'user_id'> & { user_id: string } = {
        user_id: user.id,
        raw_data_id: rawDataId,
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
      setCsvData([]);
      setCsvHeaders([]);
      setRawFileId(null);
      toast({ title: "Success!", description: "Your trade session has been analyzed." });
      setIsMappingLoading(false);
      setLoadingMessage('');
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsMappingLoading(false);
      setLoadingMessage('');
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
      const missingColumns = REQUIRED_COLUMNS.filter(col => !mapping[col.id]);
        if (missingColumns.length > 0) {
            toast({
                title: "AI Mapping Incomplete",
                description: `AI could not map the following required fields: ${missingColumns.map(c => c.label).join(', ')}. Please check your CSV headers.`,
                variant: "destructive"
            });
            setIsMappingLoading(false);
            setLoadingMessage('');
            return;
        }

        const mappedData = csvData.map(row => {
            const newRow: { [key: string]: any } = {};
            [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].forEach(col => {
                if (mapping[col.id] && row[mapping[col.id]] !== undefined) {
                    const rawValue = row[mapping[col.id]];
                    if (['pnl', 'qty', 'price'].includes(col.id)) {
                        newRow[col.id] = cleanAndParseFloat(rawValue);
                    } else if (col.id === 'tags') {
                        if (rawValue) {
                            newRow[col.id] = String(rawValue).split(',').map(t => t.trim()).filter(Boolean);
                        }
                    }
                    else {
                        newRow[col.id] = rawValue;
                    }
                }
            });
             if (!newRow.notes) newRow.notes = '';
            return newRow;
        });
        
        const validatedData = mappedData.filter((trade, index) => {
            const originalRow = csvData[index];
            const isValid = trade.pnl !== null && trade.qty !== null && trade.price !== null && trade.datetime && String(trade.datetime).trim() !== '';
            if (!isValid) {
                console.warn("Skipping invalid trade row:", { original: originalRow, mapped: trade });
            }
            return isValid;
        });

        if (validatedData.length === 0) {
            toast({
                title: "No Valid Trades Found",
                description: "After AI processing, no valid trades could be found. Please check your file for missing or invalid values in required columns.",
                variant: "destructive"
            });
            setIsMappingLoading(false);
            setLoadingMessage('');
            return;
        }

        if (validatedData.length < mappedData.length) {
            toast({
                title: "Some trades skipped",
                description: `${mappedData.length - validatedData.length} rows were skipped due to missing or invalid data in required columns (like P&L, Qty, Price, or Date/Time).`,
            });
        }
        
        if (!rawFileId) {
            toast({ title: "Error", description: "Could not find the raw file reference. Please try uploading again.", variant: "destructive" });
            setIsMappingLoading(false);
            setLoadingMessage('');
            return;
        }
      
        setLoadingMessage('Creating analysis...');
        createSessionMutation.mutate({ trades: validatedData, rawDataId: rawFileId });
    },
    onError: (error: any) => {
      toast({
        title: "AI Mapping Failed",
        description: `${error.message}. Please check your CSV file and try again.`,
        variant: "destructive"
      });
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

  const saveRawDataMutation = useMutation({
    mutationFn: async ({ file, headers, data }: { file: File; headers: string[]; data: any[] }) => {
      if (!user) throw new Error("You must be logged in.");

      const { data: rawData, error } = await supabase
        .from('raw_trade_data')
        .insert({
          user_id: user.id,
          file_name: file.name,
          headers: headers,
          data: data as any,
        })
        .select()
        .single();

      if (error) throw error;
      return rawData;
    },
    onSuccess: (rawData, variables) => {
      setRawFileId(rawData.id);
      const sampleData = (variables.data as any[]).slice(0, 3);
      validateCsvMutation.mutate({ csvHeaders: variables.headers, csvDataSample: sampleData });
    },
    onError: (error: any) => {
      toast({ title: "Error saving raw file", description: error.message, variant: "destructive" });
      setIsMappingLoading(false);
      setLoadingMessage('');
    }
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
          
          setLoadingMessage('Saving raw file...');
          saveRawDataMutation.mutate({ file, headers, data });
        },
        error: (error: any) => {
            toast({ title: "CSV Parsing Error", description: error.message, variant: "destructive" });
            setIsMappingLoading(false);
            setLoadingMessage('');
        }
      });
    }
  };

  const handleUseSampleData = () => {
    const sampleTrades = [
        { datetime: '2024-01-15 09:30:00', symbol: 'AAPL', side: 'BUY', qty: 100, price: 150.25, pnl: 45.00, notes: 'Breakout' },
        { datetime: '2024-01-15 09:45:00', symbol: 'AAPL', side: 'SELL', qty: 100, price: 150.70, pnl: 45.00, notes: 'Took profit' },
        { datetime: '2024-01-15 10:15:00', symbol: 'TSLA', side: 'SELL', qty: 50, price: 245.80, pnl: -30.00, notes: 'Stop loss hit' },
        { datetime: '2024-01-15 10:30:00', symbol: 'GOOG', side: 'BUY', qty: 20, price: 140.00, pnl: 55.00, notes: '' },
        { datetime: '2024-01-15 11:00:00', symbol: 'GOOG', side: 'SELL', qty: 20, price: 142.75, pnl: 55.00, notes: '' },
        { datetime: '2024-01-15 11:30:00', symbol: 'MSFT', side: 'BUY', qty: 50, price: 390.00, pnl: -35.00, notes: 'Faked out' },
    ];
    createSessionMutation.mutate({ trades: sampleTrades });
  };

  const handleUploadNew = () => {
    setCurrentSession(null);
    setCsvData([]);
    setCsvHeaders([]);
    setRawFileId(null);
  }

  if (currentSession) {
    return <AnalysisView currentSession={currentSession} onUploadNew={handleUploadNew} />;
  }

  return (
    <UploadView
      handleFileUpload={handleFileUpload}
      handleUseSampleData={handleUseSampleData}
      isLoading={isMappingLoading || createSessionMutation.isPending || saveRawDataMutation.isPending}
      statusText={
        saveRawDataMutation.isPending ? 'Saving raw file...' :
        isMappingLoading ? loadingMessage :
        createSessionMutation.isPending ? 'Processing...' :
        'Choose CSV file'
      }
    />
  );
};

export default AutoJournal;
