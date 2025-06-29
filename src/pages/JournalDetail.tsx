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
import QuickEntryButton from '@/components/TradeJournal/QuickEntryButton';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };
type Journal = Tables<'journals'>;

const JournalDetail = () => {
  const { journalId } = useParams<{ journalId: string }>();
  const { user } = useAuth();

  console.log('JournalDetail render - journalId:', journalId, 'user:', user?.id);

  const [showUploadView, setShowUploadView] = useState(false);
  const [showQuickEntry, setShowQuickEntry] = useState(false);

  // Fetch journal and sessions in parallel to avoid waterfall
  const { data: journalData, isLoading: isJournalLoading, error: journalError, refetch } = useQuery<{
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
    showUploadView,
    showQuickEntry
  });

  const handleTradeAdded = () => {
    refetch();
    setShowQuickEntry(false);
  };

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

  if (showUploadView || showQuickEntry) {
    return (
      <div className="container mx-auto px-4 py-6">
        {showUploadView ? (
          <JournalUploadSection journal={journal} onUploadComplete={() => setShowUploadView(false)} />
        ) : (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Add Trade to {journal.name}</h2>
            <QuickEntryButton 
              journalId={journal.id} 
              onTradeAdded={handleTradeAdded} 
            />
          </div>
        )}
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Welcome to {journal.name}</h2>
            <p className="text-gray-600 mb-8">Let's get started by adding your first trading session data.</p>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="p-6 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg text-left">
                <h3 className="font-bold text-blue-800 mb-3 flex items-center">
                  <FileSpreadsheet className="w-5 h-5 mr-2" />
                  Import CSV Data
                </h3>
                <p className="text-blue-700 mb-4 text-sm">
                  Upload a CSV file from your broker for comprehensive analysis of your trades.
                </p>
                <Button 
                  onClick={() => setShowUploadView(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Upload CSV
                </Button>
              </div>
              
              <div className="p-6 bg-gradient-to-r from-green-50 to-green-100 rounded-lg text-left">
                <h3 className="font-bold text-green-800 mb-3 flex items-center">
                  <PencilLine className="w-5 h-5 mr-2" />
                  Manual Entry
                </h3>
                <p className="text-green-700 mb-4 text-sm">
                  Manually add individual trades with our simple form.
                </p>
                <Button 
                  onClick={() => setShowQuickEntry(true)} 
                  className="bg-green-600 hover:bg-green-700"
                >
                  Add Trade Manually
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <JournalDashboard 
    journal={journal} 
    sessions={sessions} 
    onUploadNew={() => setShowUploadView(true)} 
  />;
};

export default JournalDetail;