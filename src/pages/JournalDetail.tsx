
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
      const { data, error } = await supabase
        .from('trade_sessions')
        .select('*, trades(*)')
        .eq('journal_id', journalId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching sessions:', error);
        throw error;
      }
      console.log('Sessions fetched:', data?.length || 0, 'sessions');
      return (data as TradeSessionWithTrades[]) || [];
    },
    enabled: !!journalId,
  });

  console.log('Current state:', {
    isJournalLoading,
    isSessionsLoading,
    journalError,
    sessionsError,
    journal: !!journal,
    sessionsCount: sessions?.length,
    showUploadView
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

  if (showUploadView || !sessions || sessions.length === 0) {
    console.log('Showing upload view');
    return <JournalUploadSection journal={journal} onUploadComplete={() => setShowUploadView(false)} />;
  }

  console.log('Showing journal dashboard');
  return <JournalDashboard journal={journal} sessions={sessions} onUploadNew={() => setShowUploadView(true)} />;
};

export default JournalDetail;
