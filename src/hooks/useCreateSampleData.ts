
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Tables } from '@/integrations/supabase/types';

export const useCreateSampleData = (journal: Tables<'journals'>) => {
  const { user } = useAuth();
  const [loadingMessage, setLoadingMessage] = useState('');

  const createSampleData = async () => {
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
    try {
      setLoadingMessage('Creating sample session...');
      
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
      
      window.location.reload();
    } catch (error: any) {
      console.error('Error creating sample data:', error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoadingMessage('');
    }
  };

  return { createSampleData, loadingMessage };
};
