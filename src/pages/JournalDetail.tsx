
import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import Papa from 'papaparse';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { calculateMetrics } from '@/lib/trade-metrics';
import AnalysisView from '@/components/AutoJournal/AnalysisView';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload, Loader2 } from 'lucide-react';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };
type Journal = Tables<'journals'>;

const JournalDetail = () => {
  const { journalId } = useParams<{ journalId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  console.log('JournalDetail render - journalId:', journalId, 'user:', user?.id);

  const [showUploadView, setShowUploadView] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const { data: journal, isLoading: isJournalLoading, error: journalError } = useQuery<Journal | null>({
    queryKey: ['journal', journalId],
    queryFn: async () => {
      console.log('Fetching journal with ID:', journalId);
      if (!journalId) {
        console.log('No journalId provided');
        return null;
      }
      const { data, error } = await supabase.from('journals').select('*').eq('id', journalId).single();
      if (error) {
        console.error('Error fetching journal:', error);
        toast({ title: "Error", description: "Could not fetch journal details.", variant: "destructive" });
        navigate('/journals');
        throw error;
      }
      console.log('Journal fetched:', data);
      return data;
    },
    enabled: !!journalId,
  });

  const { data: sessions, isLoading: isSessionsLoading, error: sessionsError } = useQuery({
    queryKey: ['sessions', journalId],
    queryFn: async () => {
      console.log('Fetching sessions for journal:', journalId);
      if (!journalId) return [];
      const { data, error } = await supabase.from('trade_sessions').select('*, trades(*)').eq('journal_id', journalId).order('created_at', { ascending: true });
      if (error) {
        console.error('Error fetching sessions:', error);
        throw error;
      }
      console.log('Sessions fetched:', data?.length || 0, 'sessions');
      return (data as TradeSessionWithTrades[]) || [];
    },
    enabled: !!journalId,
  });

  useEffect(() => {
    console.log('Sessions loading state:', isSessionsLoading, 'Sessions data:', sessions?.length);
    if (!isSessionsLoading && (!sessions || sessions.length === 0)) {
      console.log('No sessions found, showing upload view');
      setShowUploadView(true);
    }
  }, [sessions, isSessionsLoading]);

  const allTrades = useMemo(() => {
    const trades = sessions?.flatMap(session => session.trades) || [];
    console.log('All trades calculated:', trades.length);
    return trades;
  }, [sessions]);

  const journalMetricsAndTrades = useMemo(() => {
    if (!sessions || allTrades.length === 0) {
      console.log('No metrics calculated - no sessions or trades');
      return null;
    }
    const metrics = calculateMetrics(allTrades);
    console.log('Metrics calculated:', metrics);
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

  const handleUseSampleData = () => {
    console.log('Using sample data...');
    const sampleTrades = [
        { datetime: '2024-01-15 09:30:00', symbol: 'AAPL', side: 'BUY', qty: 100, price: 150.25, pnl: 45.00, notes: 'Breakout' },
        { datetime: '2024-01-15 10:15:00', symbol: 'TSLA', side: 'SELL', qty: 50, price: 245.80, pnl: -30.00, notes: 'Stop loss hit' },
        { datetime: '2024-01-15 11:00:00', symbol: 'GOOG', side: 'BUY', qty: 20, price: 140.00, pnl: 55.00, notes: '' },
    ];
    
    if (!user || !journalId) {
      toast({ title: "Error", description: "Authentication or journal issue.", variant: "destructive" });
      return;
    }

    console.log('Creating session with sample data...');
    // Simple direct insertion for testing
    const createSampleSession = async () => {
      try {
        setLoadingMessage('Creating sample session...');
        
        // Create session first
        const sessionData = {
          user_id: user.id,
          journal_id: journalId,
          total_trades: sampleTrades.length,
          total_pnl: sampleTrades.reduce((sum, t) => sum + t.pnl, 0),
          win_rate: 0.67,
          profit_factor: 2.3,
          max_drawdown: -30,
          avg_win: 50,
          avg_loss: -30
        };

        const { data: newSession, error: sessionError } = await supabase
          .from('trade_sessions')
          .insert(sessionData)
          .select()
          .single();

        if (sessionError) throw sessionError;
        console.log('Session created:', newSession);

        // Insert trades
        const tradesData = sampleTrades.map(trade => ({
          ...trade,
          session_id: newSession.id,
          user_id: user.id,
          journal_id: journalId,
          datetime: new Date(trade.datetime).toISOString()
        }));

        const { error: tradesError } = await supabase.from('trades').insert(tradesData);
        if (tradesError) throw tradesError;

        console.log('Sample data created successfully');
        toast({ title: "Success!", description: "Sample trades created." });
        setShowUploadView(false);
        setLoadingMessage('');
        
        // Refresh the data
        window.location.reload();
      } catch (error: any) {
        console.error('Error creating sample data:', error);
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setLoadingMessage('');
      }
    };

    createSampleSession();
  };

  console.log('Current state:', {
    isJournalLoading,
    isSessionsLoading,
    journalError,
    sessionsError,
    journal: !!journal,
    sessionsCount: sessions?.length,
    showUploadView,
    journalMetricsAndTrades: !!journalMetricsAndTrades
  });

  if (isJournalLoading || isSessionsLoading) {
    console.log('Still loading...');
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading journal...</p>
        </div>
      </div>
    );
  }

  if (journalError || sessionsError) {
    console.log('Error occurred:', journalError || sessionsError);
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600">Error loading journal</p>
          <Button onClick={() => navigate('/journals')} className="mt-4">
            Back to Journals
          </Button>
        </div>
      </div>
    );
  }

  if (!journal) {
    console.log('No journal found');
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p>Journal not found</p>
          <Button onClick={() => navigate('/journals')} className="mt-4">
            Back to Journals
          </Button>
        </div>
      </div>
    );
  }

  if (showUploadView || !journalMetricsAndTrades) {
    console.log('Showing upload view');
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => navigate('/journals')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{journal.name}</h1>
            <p className="text-muted-foreground">Upload your first trade history file to get started.</p>
          </div>
        </div>
        <div className="flex-grow flex items-center justify-center">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Upload Trades</CardTitle>
              <CardDescription>Upload a CSV file to analyze your trades or try sample data.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors">
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-slate-700 mb-2">
                  {loadingMessage || 'CSV upload coming soon...'}
                </p>
                <p className="text-sm text-slate-500">
                  For now, try the sample data below.
                </p>
              </div>

              <div className="mt-6 text-center">
                <Button
                  onClick={handleUseSampleData}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={!!loadingMessage}
                >
                  {loadingMessage ? 'Processing...' : 'Use Sample Data for Demo'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  console.log('Showing analysis view');
  return <AnalysisView currentSession={journalMetricsAndTrades} onUploadNew={() => setShowUploadView(true)} />;
};

export default JournalDetail;
