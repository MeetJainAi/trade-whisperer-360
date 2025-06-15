
import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { Tables } from '@/integrations/supabase/types';
import { calculateMetrics } from '@/lib/trade-metrics';
import AnalysisView from '@/components/AutoJournal/AnalysisView';
import { useParams } from 'react-router-dom';
import JournalUploadSection from '@/components/JournalDetail/JournalUploadSection';
import JournalLoadingView from '@/components/JournalDetail/JournalLoadingView';
import JournalErrorView from '@/components/JournalDetail/JournalErrorView';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };
type Journal = Tables<'journals'>;

const JournalDetail = () => {
  const { journalId } = useParams<{ journalId: string }>();
  const { user } = useAuth();

  console.log('JournalDetail render - journalId:', journalId, 'user:', user?.id);

  const [showUploadView, setShowUploadView] = useState(false);

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
    return <JournalLoadingView />;
  }

  if (journalError || sessionsError) {
    return <JournalErrorView error={journalError || sessionsError} />;
  }

  if (!journal) {
    return <JournalErrorView notFound />;
  }

  if (showUploadView || !journalMetricsAndTrades) {
    console.log('Showing upload view');
    return <JournalUploadSection journal={journal} />;
  }

  console.log('Showing analysis view');
  return <AnalysisView currentSession={journalMetricsAndTrades} onUploadNew={() => setShowUploadView(true)} />;
};

export default JournalDetail;
