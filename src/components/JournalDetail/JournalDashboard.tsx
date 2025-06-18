import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, Upload, TrendingUp, TrendingDown, MoreHorizontal, Edit, Trash2, Eye, Calendar, DollarSign, Target, BarChart3 } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { calculateMetrics } from '@/lib/trade-metrics';
import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };
type Journal = Tables<'journals'>;

interface JournalDashboardProps {
  journal: Journal;
  sessions: TradeSessionWithTrades[];
  onUploadNew: () => void;
}

const JournalDashboard = ({ journal, sessions, onUploadNew }: JournalDashboardProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const aggregatedMetrics = useMemo(() => {
    const allTrades = sessions.flatMap(session => session.trades);
    if (allTrades.length === 0) return null;
    return calculateMetrics(allTrades);
  }, [sessions]);

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('trade_sessions')
        .delete()
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalWithSessions', journal.id] });
      toast({ title: "Success", description: "Trading session deleted successfully." });
      setSessionToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSessionClick = (sessionId: string) => {
    navigate(`/journals/${journal.id}/sessions/${sessionId}`);
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionMutation.mutate(sessionId);
  };

  const formatCurrency = (value: number) => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(Math.abs(value));
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getPnLBadgeVariant = (pnl: number) => {
    if (pnl > 0) return 'default';
    if (pnl < 0) return 'destructive';
    return 'secondary';
  };

  const getWinRateColor = (winRate: number) => {
    if (winRate >= 70) return 'text-green-600';
    if (winRate >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Enhanced Header */}
      <header className="border-b bg-white/90 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => navigate('/journals')}
                className="hover:bg-slate-100 transition-colors"
                aria-label="Back to journals"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-green-500 flex items-center justify-center shadow-lg">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">{journal.name}</h1>
                  <p className="text-slate-600 text-sm">
                    {journal.description || 'Trading Journal Dashboard'} • {sessions.length} sessions
                  </p>
                </div>
              </div>
            </div>
            <Button 
              onClick={onUploadNew} 
              className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 shadow-lg"
              aria-label="Upload new trading session"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload New Session
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Enhanced Metrics Overview */}
        {aggregatedMetrics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Total P&L</CardTitle>
                {aggregatedMetrics.total_pnl >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${aggregatedMetrics.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(aggregatedMetrics.total_pnl)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Across {aggregatedMetrics.total_trades} trades
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Win Rate</CardTitle>
                <Target className="h-5 w-5 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${getWinRateColor(aggregatedMetrics.win_rate)}`}>
                  {formatPercentage(aggregatedMetrics.win_rate)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Success rate
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Total Trades</CardTitle>
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-800">
                  {aggregatedMetrics.total_trades}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Executed positions
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Profit Factor</CardTitle>
                <DollarSign className="h-5 w-5 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-800">
                  {aggregatedMetrics.profit_factor >= 9999 ? '∞' : aggregatedMetrics.profit_factor.toFixed(2)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Risk-reward ratio
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Enhanced Sessions Table */}
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Trading Sessions
                </CardTitle>
                <CardDescription className="text-slate-600 mt-1">
                  Click on a session to view detailed analysis, edit, or delete entries.
                </CardDescription>
              </div>
              {sessions.length > 0 && (
                <Badge variant="outline" className="text-slate-600">
                  {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                <BarChart3 className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2">No Trading Sessions Yet</h3>
                <p className="text-slate-500 mb-6">Upload your first CSV file to start analyzing your trades.</p>
                <Button onClick={onUploadNew} className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Trades Now
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="border-b border-slate-200">
                      <TableHead className="font-semibold text-slate-700">Date</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">Trades</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">P&L</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">Win Rate</TableHead>
                      <TableHead className="font-semibold text-slate-700">AI Insight</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session, index) => {
                      const sessionMetrics = calculateMetrics(session.trades);
                      const isRecent = index < 3;
                      
                      return (
                        <TableRow 
                          key={session.id}
                          className={`cursor-pointer transition-all duration-200 hover:bg-blue-50/50 ${isRecent ? 'bg-green-50/30' : ''}`}
                          onClick={() => handleSessionClick(session.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSessionClick(session.id);
                            }
                          }}
                          aria-label={`View session from ${new Date(session.created_at).toLocaleDateString()}`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className="text-slate-800">
                                {new Date(session.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                              {isRecent && (
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                  Recent
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {new Date(session.created_at).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono">
                              {sessionMetrics.total_trades}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge 
                              variant={getPnLBadgeVariant(sessionMetrics.total_pnl)}
                              className="font-mono font-semibold"
                            >
                              {formatCurrency(sessionMetrics.total_pnl)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${getWinRateColor(sessionMetrics.win_rate)}`}>
                              {formatPercentage(sessionMetrics.win_rate)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="truncate text-slate-600 text-sm">
                              {session.ai_key_insight || 'Analysis pending...'}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="h-8 w-8 p-0 hover:bg-slate-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSessionClick(session.id);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Eye className="h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // TODO: Implement edit functionality
                                    toast({ title: "Feature Coming Soon", description: "Edit functionality will be available in the next update." });
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Edit className="h-4 w-4" />
                                  Edit Session
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSessionToDelete(session.id);
                                  }}
                                  className="flex items-center gap-2 text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete Session
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trading Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trading session? This action cannot be undone and will permanently remove all trades and analysis data from this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sessionToDelete && handleDeleteSession(sessionToDelete)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteSessionMutation.isPending}
            >
              {deleteSessionMutation.isPending ? 'Deleting...' : 'Delete Session'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default JournalDashboard;