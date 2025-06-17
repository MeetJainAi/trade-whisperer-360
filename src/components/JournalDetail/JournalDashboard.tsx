
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Upload, TrendingUp, TrendingDown } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { calculateMetrics } from '@/lib/trade-metrics';
import { useMemo } from 'react';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };
type Journal = Tables<'journals'>;

interface JournalDashboardProps {
  journal: Journal;
  sessions: TradeSessionWithTrades[];
  onUploadNew: () => void;
}

const JournalDashboard = ({ journal, sessions, onUploadNew }: JournalDashboardProps) => {
  const navigate = useNavigate();

  const aggregatedMetrics = useMemo(() => {
    const allTrades = sessions.flatMap(session => session.trades);
    if (allTrades.length === 0) return null;
    return calculateMetrics(allTrades);
  }, [sessions]);

  const handleSessionClick = (sessionId: string) => {
    navigate(`/journals/${journal.id}/sessions/${sessionId}`);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/journals')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{journal.name}</h1>
            <p className="text-muted-foreground">{journal.description || 'Trading Journal Dashboard'}</p>
          </div>
        </div>
        <Button onClick={onUploadNew}>
          <Upload className="mr-2 h-4 w-4" />
          Upload New Session
        </Button>
      </div>

      {/* Metrics Overview */}
      {aggregatedMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
              {aggregatedMetrics.total_pnl >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${aggregatedMetrics.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(aggregatedMetrics.total_pnl)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatPercentage(aggregatedMetrics.win_rate)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {aggregatedMetrics.total_trades}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {aggregatedMetrics.profit_factor.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Sessions</CardTitle>
          <CardDescription>
            Click on a session to view detailed analysis and AI insights.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Trades</TableHead>
                <TableHead>P&L</TableHead>
                <TableHead>Win Rate</TableHead>
                <TableHead>AI Insight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => {
                const sessionMetrics = calculateMetrics(session.trades);
                return (
                  <TableRow 
                    key={session.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => handleSessionClick(session.id)}
                  >
                    <TableCell className="font-medium">
                      {new Date(session.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{sessionMetrics.total_trades}</TableCell>
                    <TableCell className={sessionMetrics.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(sessionMetrics.total_pnl)}
                    </TableCell>
                    <TableCell>{formatPercentage(sessionMetrics.win_rate)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {session.ai_key_insight || 'No insight available'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default JournalDashboard;
