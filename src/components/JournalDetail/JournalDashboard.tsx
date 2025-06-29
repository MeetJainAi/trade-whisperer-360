import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Upload, TrendingUp, TrendingDown, MoreHorizontal, Edit, Trash2, Eye, Calendar, DollarSign, Target, BarChart3, Filter, Download, Plus, FileSpreadsheet, FileUp, ChevronRight } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { calculateMetrics } from '@/lib/trade-metrics';
import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import CalendarView from '@/components/CalendarView';
import JournalMetricsCard from '@/components/JournalDetail/JournalMetricsCard';
import JournalStatsCard from '@/components/JournalDetail/JournalStatsCard';

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
  const [activeTab, setActiveTab] = useState('sessions');
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'week' | 'month' | 'quarter'>('all');

  const aggregatedMetrics = useMemo(() => {
    const allTrades = sessions.flatMap(session => session.trades);
    if (allTrades.length === 0) return null;
    return calculateMetrics(allTrades);
  }, [sessions]);

  // Filter sessions based on the selected period
  const filteredSessions = useMemo(() => {
    if (filterPeriod === 'all') return sessions;
    
    const now = new Date();
    let cutoffDate = new Date();
    
    if (filterPeriod === 'week') {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (filterPeriod === 'month') {
      cutoffDate.setMonth(now.getMonth() - 1);
    } else if (filterPeriod === 'quarter') {
      cutoffDate.setMonth(now.getMonth() - 3);
    }
    
    return sessions.filter(session => new Date(session.created_at) >= cutoffDate);
  }, [sessions, filterPeriod]);

  // Calculate period metrics
  const periodMetrics = useMemo(() => {
    const periodTrades = filteredSessions.flatMap(session => session.trades);
    if (periodTrades.length === 0) return null;
    return calculateMetrics(periodTrades);
  }, [filteredSessions]);

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('trade_sessions')
        .delete()
        .eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Properly invalidate queries after mutation
      queryClient.invalidateQueries({ queryKey: ['journalWithSessions', journal.id] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const getWinRateColor = (winRate: number) => {
    if (winRate >= 70) return 'text-green-600';
    if (winRate >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const exportJournalData = async () => {
    try {
      // Get all trades for this journal
      const { data: allTrades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('journal_id', journal.id)
        .order('datetime', { ascending: false });
        
      if (error) throw error;
      
      if (!allTrades || allTrades.length === 0) {
        toast({ title: "No data", description: "No trades to export for this journal", variant: "default" });
        return;
      }
      
      // Convert to CSV
      const headers = Object.keys(allTrades[0]).join(',');
      const rows = allTrades.map(trade => Object.values(trade).join(','));
      const csv = [headers, ...rows].join('\n');
      
      // Create download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${journal.name.replace(/\s+/g, '_')}_trades_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Export successful", description: `Exported ${allTrades.length} trades to CSV` });
    } catch (error: any) {
      console.error("Export error:", error);
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    }
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
                    {journal.description || 'Trading Journal Dashboard'} • {sessions.length} sessions • {aggregatedMetrics?.total_trades || 0} trades
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="border-slate-300">
                    <FileUp className="mr-2 h-4 w-4" />
                    Import/Export
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={onUploadNew}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Import CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportJournalData}>
                    <Download className="mr-2 h-4 w-4" />
                    Export Journal Data
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button 
                onClick={onUploadNew} 
                className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 shadow-lg"
                aria-label="Upload new trading session"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Session
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Journal Overview Cards */}
        {aggregatedMetrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <JournalMetricsCard
              title="Net P&L"
              value={aggregatedMetrics.total_pnl}
              isPositive={aggregatedMetrics.total_pnl >= 0}
              icon={DollarSign}
              description={`Across ${aggregatedMetrics.total_trades} trades`}
            />
            
            <JournalMetricsCard
              title="Win Rate"
              value={aggregatedMetrics.win_rate}
              format="percent"
              icon={Target}
              description={`${aggregatedMetrics.profit_factor.toFixed(2)} profit factor`}
              valueColor={getWinRateColor(aggregatedMetrics.win_rate)}
            />
            
            <JournalMetricsCard
              title="Reward/Risk"
              value={aggregatedMetrics.reward_risk_ratio}
              format="ratio"
              icon={TrendingUp}
              description={`${formatCurrency(aggregatedMetrics.avg_win)} : ${formatCurrency(Math.abs(aggregatedMetrics.avg_loss))}`}
            />
            
            <JournalMetricsCard
              title="Expectancy"
              value={aggregatedMetrics.expectancy}
              isPositive={aggregatedMetrics.expectancy >= 0}
              icon={DollarSign}
              description="Average $ per trade"
            />
          </div>
        )}

        {/* Period Filter */}
        <div className="flex justify-end mb-4">
          <div className="inline-flex rounded-md shadow-sm">
            <Button 
              variant={filterPeriod === 'all' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setFilterPeriod('all')}
              className="rounded-l-md rounded-r-none"
            >
              All Time
            </Button>
            <Button 
              variant={filterPeriod === 'quarter' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setFilterPeriod('quarter')}
              className="rounded-none border-l-0 border-r-0"
            >
              Last 3 Months
            </Button>
            <Button 
              variant={filterPeriod === 'month' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setFilterPeriod('month')}
              className="rounded-none border-r-0"
            >
              Last Month
            </Button>
            <Button 
              variant={filterPeriod === 'week' ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setFilterPeriod('week')}
              className="rounded-r-md rounded-l-none"
            >
              Last Week
            </Button>
          </div>
        </div>

        {/* Period Stats Summary */}
        {periodMetrics && filterPeriod !== 'all' && (
          <div className="mb-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Calendar className="w-5 h-5 text-blue-600 mr-2" />
                  {filterPeriod === 'week' ? 'Last 7 Days' : 
                   filterPeriod === 'month' ? 'Last 30 Days' : 'Last 3 Months'} Performance
                </CardTitle>
                <CardDescription>
                  {filteredSessions.length} trading sessions • {periodMetrics.total_trades} trades
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <JournalStatsCard 
                    label="P&L" 
                    value={formatCurrency(periodMetrics.total_pnl)}
                    isPositive={periodMetrics.total_pnl > 0}
                  />
                  <JournalStatsCard 
                    label="Win Rate" 
                    value={`${periodMetrics.win_rate.toFixed(1)}%`}
                    isPositive={periodMetrics.win_rate >= 50}
                  />
                  <JournalStatsCard 
                    label="Profit Factor" 
                    value={periodMetrics.profit_factor >= 9999 ? '∞' : periodMetrics.profit_factor.toFixed(2)}
                    isPositive={periodMetrics.profit_factor >= 1.5}
                  />
                  <JournalStatsCard 
                    label="Avg Trade" 
                    value={formatCurrency(periodMetrics.expectancy)}
                    isPositive={periodMetrics.expectancy > 0}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs for Sessions and Calendar View */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="sessions" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Trading Sessions
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Calendar View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions">
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
                      Click on a session to view detailed analysis, edit, or delete entries
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    {sessions.length > 0 && (
                      <Badge variant="outline" className="text-slate-600">
                        {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                          <Filter className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setFilterPeriod('all')}>
                          All Sessions
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterPeriod('quarter')}>
                          Last 3 Months
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterPeriod('month')}>
                          Last 30 Days
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterPeriod('week')}>
                          Last 7 Days
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredSessions.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                    <BarChart3 className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">No Trading Sessions Found</h3>
                    {filterPeriod !== 'all' ? (
                      <>
                        <p className="text-slate-500 mb-6">There are no sessions in the selected time period.</p>
                        <Button onClick={() => setFilterPeriod('all')} variant="outline">
                          View All Sessions
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-slate-500 mb-6">Upload your first CSV file to start analyzing your trades.</p>
                        <Button onClick={onUploadNew} className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600">
                          <Upload className="mr-2 h-4 w-4" />
                          Upload Trades Now
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50/80">
                        <TableRow className="border-b border-slate-200">
                          <TableHead className="font-semibold text-slate-700">Date</TableHead>
                          <TableHead className="font-semibold text-slate-700 text-center">Trades</TableHead>
                          <TableHead className="font-semibold text-slate-700 text-center">Win Rate</TableHead>
                          <TableHead className="font-semibold text-slate-700 text-right">P&L</TableHead>
                          <TableHead className="font-semibold text-slate-700">Performance</TableHead>
                          <TableHead className="font-semibold text-slate-700 text-center w-20">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSessions.map((session, index) => {
                          const sessionMetrics = calculateMetrics(session.trades);
                          const isRecent = index < 3;
                          const isProfitable = sessionMetrics.total_pnl > 0;
                          
                          return (
                            <TableRow 
                              key={session.id}
                              className={`cursor-pointer transition-all duration-200 hover:bg-blue-50/50 ${
                                isRecent ? 'bg-green-50/30' : ''
                              } ${isProfitable ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-red-500'}`}
                              onClick={() => handleSessionClick(session.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleSessionClick(session.id);
                                }
                              }}
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center space-x-2">
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
                              <TableCell className="text-center">
                                <span className={`font-semibold ${getWinRateColor(sessionMetrics.win_rate)}`}>
                                  {sessionMetrics.win_rate.toFixed(1)}%
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                <span className={`${sessionMetrics.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {sessionMetrics.total_pnl >= 0 ? '+' : ''}
                                  {formatCurrency(sessionMetrics.total_pnl)}
                                </span>
                              </TableCell>
                              <TableCell className="max-w-xs">
                                <div className="flex items-center">
                                  <div className="w-full bg-slate-200 rounded-full h-2 mr-2">
                                    <div 
                                      className={`${sessionMetrics.profit_factor >= 2 ? 'bg-green-500' : 
                                                    sessionMetrics.profit_factor >= 1 ? 'bg-yellow-500' : 
                                                    'bg-red-500'} h-2 rounded-full`}
                                      style={{ width: `${Math.min(100, sessionMetrics.profit_factor * 33.33)}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs font-medium whitespace-nowrap">
                                    {sessionMetrics.profit_factor >= 9999 ? '∞' : sessionMetrics.profit_factor.toFixed(1)}x
                                  </span>
                                </div>
                                <div className="truncate text-slate-600 text-xs">
                                  {session.ai_key_insight ? session.ai_key_insight.substring(0, 50) + '...' : 'No AI insights'}
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
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarView sessions={sessions} onSessionClick={handleSessionClick} />
          </TabsContent>
        </Tabs>
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