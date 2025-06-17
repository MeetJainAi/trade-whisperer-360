
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { Tables } from '@/integrations/supabase/types';
import { useParams } from 'react-router-dom';
import JournalUploadSection from '@/components/JournalDetail/JournalUploadSection';
import JournalLoadingView from '@/components/JournalDetail/JournalLoadingView';
import JournalErrorView from '@/components/JournalDetail/JournalErrorView';
import JournalDashboard from '@/components/JournalDetail/JournalDashboard';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };
type Journal = Tables<'journals'>;

const JournalDetail = () => {
  const { journalId } = useParams<{ journalId: string }>();
  const { user } = useAuth();

  console.log('JournalDetail render - journalId:', journalId, 'user:', user?.id);

  const [showUploadView, setShowUploadView] = useState(false);

  // Fetch journal and sessions in parallel to avoid waterfall
  const { data: journalData, isLoading: isJournalLoading, error: journalError } = useQuery<{
    journal: Journal;
    sessions: TradeSessionWithTrades[];
  }>({
    queryKey: ['journalWithSessions', journalId],
    queryFn: async () => {
      console.log('Fetching journal and sessions for ID:', journalId);
      if (!journalId) {
        throw new Error('No journal ID provided');
      }

      // Fetch journal and sessions in parallel
      const [journalResponse, sessionsResponse] = await Promise.all([
        supabase.from('journals').select('*').eq('id', journalId).single(),
        supabase
          .from('trade_sessions')
          .select('*, trades(*)')
          .eq('journal_id', journalId)
          .order('created_at', { ascending: false })
      ]);

      if (journalResponse.error) {
        console.error('Error fetching journal:', journalResponse.error);
        toast({ title: "Error", description: "Could not fetch journal details.", variant: "destructive" });
        throw journalResponse.error;
      }

      if (sessionsResponse.error) {
        console.error('Error fetching sessions:', sessionsResponse.error);
        throw sessionsResponse.error;
      }

      console.log('Journal fetched:', journalResponse.data);
      console.log('Sessions fetched:', sessionsResponse.data?.length || 0, 'sessions');

      return {
        journal: journalResponse.data,
        sessions: (sessionsResponse.data as TradeSessionWithTrades[]) || []
      };
    },
    enabled: !!journalId,
  });

  console.log('Current state:', {
    isJournalLoading,
    journalError,
    journal: !!journalData?.journal,
    sessionsCount: journalData?.sessions.length,
    showUploadView
  });

  if (isJournalLoading) {
    return <JournalLoadingView />;
  }

  if (journalError) {
    return <JournalErrorView error={journalError} />;
  }

  if (!journalData?.journal) {
    return <JournalErrorView notFound />;
  }

  const { journal, sessions } = journalData;

  if (showUploadView || !sessions || sessions.length === 0) {
    console.log('Showing upload view');
    return <JournalUploadSection journal={journal} onUploadComplete={() => setShowUploadView(false)} />;
  }

  console.log('Showing journal dashboard');
  return <JournalDashboard journal={journal} sessions={sessions} onUploadNew={() => setShowUploadView(true)} />;
};

export default JournalDetail;
