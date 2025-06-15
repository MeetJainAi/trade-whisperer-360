
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';

interface JournalUploadSectionProps {
  journal: Tables<'journals'>;
}

const JournalUploadSection = ({ journal }: JournalUploadSectionProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loadingMessage, setLoadingMessage] = useState('');

  const handleUseSampleData = () => {
    console.log('Using sample data...');
    const sampleTrades = [
        { datetime: '2024-01-15 09:30:00', symbol: 'AAPL', side: 'BUY', qty: 100, price: 150.25, pnl: 45.00, notes: 'Breakout' },
        { datetime: '2024-01-15 10:15:00', symbol: 'TSLA', side: 'SELL', qty: 50, price: 245.80, pnl: -30.00, notes: 'Stop loss hit' },
        { datetime: '2024-01-15 11:00:00', symbol: 'GOOG', side: 'BUY', qty: 20, price: 140.00, pnl: 55.00, notes: '' },
    ];
    
    if (!user || !journal.id) {
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
          journal_id: journal.id,
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
          journal_id: journal.id,
          datetime: new Date(trade.datetime).toISOString()
        }));

        const { error: tradesError } = await supabase.from('trades').insert(tradesData);
        if (tradesError) throw tradesError;

        console.log('Sample data created successfully');
        toast({ title: "Success!", description: "Sample trades created." });
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
};

export default JournalUploadSection;
