import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import Papa from 'papaparse';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { calculateMetrics } from '@/lib/trade-metrics';
import UploadView from '@/components/AutoJournal/UploadView';
import AnalysisView from '@/components/AutoJournal/AnalysisView';
import { Link } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
    
    const stringValue = String(value);

    // Determine if the number is negative based on parentheses or a minus sign
    const isNegative = stringValue.includes('-') || (stringValue.includes('(') && stringValue.includes(')'));
    
    // Extract numbers and the decimal point only
    const numberString = stringValue.replace(/[^0-9.]/g, '');

    if (numberString === '' || numberString === '.') {
        return null;
    }

    let number = parseFloat(numberString);

    if (isNaN(number)) {
        return null;
    }

    // Apply the negative sign if detected and the number is positive
    if (isNegative && number > 0) {
        number = -number;
    }
    
    return number;
};

const AutoJournal = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showUploadView, setShowUploadView] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawFileId, setRawFileId] = useState<string | null>(null);
  const [isMappingLoading, setIsMappingLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);

  const { data: journals, isLoading: journalsLoading } = useQuery({
    queryKey: ['journals', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('journals')
        .select('id, name')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (journals && journals.length === 1 && !selectedJournalId) {
      setSelectedJournalId(journals[0].id);
    }
  }, [journals, selectedJournalId]);

  const { data: latestSession, isLoading: isLatestSessionLoading } = useQuery({
    queryKey: ['latest-trade-session', user?.id],
    queryFn: async () => {
        if (!user) return null;

        const { data, error } = await supabase
            .from('trade_sessions')
            .select('*, trades(*)')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching latest session:', error);
            throw error;
        }
        
        return data as TradeSessionWithTrades | null;
    },
    enabled: !!user,
  });

  const createSessionMutation = useMutation({
    mutationFn: async ({ trades, rawDataId, journalId }: { trades: any[], rawDataId?: string, journalId: string | null }) => {
      if (!user) throw new Error("You must be logged in to create a session.");
      if (trades.length === 0) throw new Error("No trades found in the file.");
      if (!journalId) throw new Error("A journal must be selected.");

      const metrics = calculateMetrics(trades);

      const { data: insights, error: insightsError } = await supabase.functions.invoke('analyze-trades', {
        body: { trades },
      });
      if (insightsError) throw new Error(`Failed to get AI insights: ${insightsError.message}`);

      const sessionData: Omit<TablesInsert<'trade_sessions'>, 'user_id'> & { user_id: string } = {
        user_id: user.id,
        raw_data_id: rawDataId,
        journal_id: journalId,
        total_pnl: metrics.total_pnl,
        total_trades: metrics.total_trades,
        win_rate: metrics.win_rate,
        avg_win: metrics.avg_win,
        avg_loss: metrics.avg_loss,
        max_drawdown: metrics.max_drawdown,
        equity_curve: metrics.equity_curve as any,
        time_data: metrics.time_data as any,
        profit_factor: metrics.profit_factor,
        trades_by_day: metrics.trades_by_day as any,
        trades_by_symbol: metrics.trades_by_symbol as any,
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
      setShowUploadView(false);
      queryClient.invalidateQueries({ queryKey: ['latest-trade-session', user?.id] });
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
        createSessionMutation.mutate({ trades: validatedData, rawDataId: rawFileId, journalId: selectedJournalId });
    },
    onError: (error: any) => {
      toast({
        title: "AI Mapping Failed",
        description: `${error.message}. Please check your CSV file and try again.`,
        variant: "destructive"
      });
    },
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
    if (!selectedJournalId) {
      toast({ title: "Select a Journal", description: "Please select a journal before using sample data.", variant: "destructive" });
      return;
    }
    const sampleTrades = [
        { datetime: '2024-01-15 09:30:00', symbol: 'AAPL', side: 'BUY', qty: 100, price: 150.25, pnl: 45.00, notes: 'Breakout' },
        { datetime: '2024-01-15 09:45:00', symbol: 'AAPL', side: 'SELL', qty: 100, price: 150.70, pnl: 45.00, notes: 'Took profit' },
        { datetime: '2024-01-15 10:15:00', symbol: 'TSLA', side: 'SELL', qty: 50, price: 245.80, pnl: -30.00, notes: 'Stop loss hit' },
        { datetime: '2024-01-15 10:30:00', symbol: 'GOOG', side: 'BUY', qty: 20, price: 140.00, pnl: 55.00, notes: '' },
        { datetime: '2024-01-15 11:00:00', symbol: 'GOOG', side: 'SELL', qty: 20, price: 142.75, pnl: 55.00, notes: '' },
        { datetime: '2024-01-15 11:30:00', symbol: 'MSFT', side: 'BUY', qty: 50, price: 390.00, pnl: -35.00, notes: 'Faked out' },
    ];
    createSessionMutation.mutate({ trades: sampleTrades, journalId: selectedJournalId });
  };

  const handleUploadNew = () => {
    setShowUploadView(true);
    
    createSessionMutation.reset();
    mapColumnsMutation.reset();
    validateCsvMutation.reset();
    saveRawDataMutation.reset();

    setCsvData([]);
    setCsvHeaders([]);
    setRawFileId(null);
    setIsMappingLoading(false);
    setLoadingMessage('');
    setSelectedJournalId(null);
  }

  const sessionToShow = createSessionMutation.data || latestSession;
  const isProcessing = isMappingLoading || createSessionMutation.isPending || saveRawDataMutation.isPending || validateCsvMutation.isPending || mapColumnsMutation.isPending;

  if (isLatestSessionLoading || journalsLoading) {
    return (
        <div className="flex items-center justify-center h-screen bg-slate-50">
            <div className="text-center">
                <p className="text-lg text-slate-600">Loading your trading journal...</p>
            </div>
        </div>
    );
  }

  if (sessionToShow && !showUploadView) {
    return <AnalysisView currentSession={sessionToShow} onUploadNew={handleUploadNew} />;
  }

  if (!journals || journals.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50 text-center p-8">
            <h2 className="text-2xl font-bold mb-4">No Journals Found</h2>
            <p className="text-slate-600 mb-6 max-w-md">You need to create a journal before you can upload trades. Journals help you organize sessions from different accounts or strategies.</p>
            <Link to="/journals">
                <Button>Go to Journals</Button>
            </Link>
        </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
            <CardTitle>Upload New Trades</CardTitle>
            <CardDescription>Select a journal and upload your CSV file to get an analysis.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 pt-6">
            <div className="w-full">
                <label htmlFor="journal-select" className="block text-sm font-medium text-gray-700 mb-1">Select Journal</label>
                <Select onValueChange={setSelectedJournalId} value={selectedJournalId || ''}>
                    <SelectTrigger id="journal-select">
                        <SelectValue placeholder="Select a journal to upload to" />
                    </SelectTrigger>
                    <SelectContent>
                        {journals?.map(journal => (
                            <SelectItem key={journal.id} value={journal.id}>{journal.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <UploadView
              handleFileUpload={handleFileUpload}
              handleUseSampleData={handleUseSampleData}
              isLoading={isProcessing || !selectedJournalId}
              statusText={
                !selectedJournalId ? 'Please select a journal' :
                saveRawDataMutation.isPending ? 'Saving raw file...' :
                isMappingLoading ? loadingMessage :
                createSessionMutation.isPending ? 'Processing...' :
                'Choose CSV file'
              }
            />
        </CardContent>
      </Card>
    </div>
  );
};

export default AutoJournal;
