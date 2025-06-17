
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import AnalysisView from '@/components/AutoJournal/AnalysisView';
import JournalLoadingView from '@/components/JournalDetail/JournalLoadingView';
import JournalErrorView from '@/components/JournalDetail/JournalErrorView';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };

const SessionDetail = () => {
  const { journalId, sessionId } = useParams<{ journalId: string; sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  console.log('SessionDetail render - journalId:', journalId, 'sessionId:', sessionId, 'user:', user?.id);

  const { data: session, isLoading, error } = useQuery<TradeSessionWithTrades | null>({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      console.log('Fetching session with ID:', sessionId);
      if (!sessionId) {
        console.log('No sessionId provided');
        return null;
      }
      
      try {
        const { data, error } = await supabase
          .from('trade_sessions')
          .select('*, trades(*)')
          .eq('id', sessionId)
          .single();
        
        if (error) {
          console.error('Error fetching session:', error);
          toast({ title: "Error", description: "Could not fetch session details.", variant: "destructive" });
          throw error;
        }
        console.log('Session fetched:', data);
        return data as TradeSessionWithTrades;
      } catch (error) {
        console.error('Failed to fetch session:', error);
        throw error;
      }
    },
    enabled: !!sessionId,
  });

  const { data: journal } = useQuery({
    queryKey: ['journal', journalId],
    queryFn: async () => {
      if (!journalId) return null;
      
      try {
        const { data, error } = await supabase
          .from('journals')
          .select('*')
          .eq('id', journalId)
          .single();
        
        if (error) {
          console.error('Error fetching journal:', error);
          return null;
        }
        return data;
      } catch (error) {
        console.error('Failed to fetch journal:', error);
        return null;
      }
    },
    enabled: !!journalId,
  });

  if (isLoading) {
    return <JournalLoadingView />;
  }

  if (error) {
    return <JournalErrorView error={error} />;
  }

  if (!session) {
    return <JournalErrorView notFound />;
  }

  const handleBackToJournal = () => {
    navigate(`/journals/${journalId}`);
  };

  const handleUploadNew = () => {
    navigate(`/journals/${journalId}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <div className="p-4 md:p-8 border-b bg-white">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleBackToJournal}
            aria-label="Back to journal"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {journal?.name || 'Trading Session'}
            </h1>
            <p className="text-muted-foreground">
              Session from {new Date(session.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1">
        <AnalysisView currentSession={session} onUploadNew={handleUploadNew} />
      </div>
    </div>
  );
};

export default SessionDetail;
