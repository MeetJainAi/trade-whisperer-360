import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tables } from "@/integrations/supabase/types"
import { format } from 'date-fns';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { ListFilter, SortAsc, SortDesc, Edit, FileText, MoreHorizontal, Save, X, Trash2, Search, Download, Calendar, TrendingUp, TrendingDown, Target, Clock, DollarSign, Activity, BarChart3, Eye, Filter, ChevronDown, Plus, Zap } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface TradesLogTableProps {
  trades: Tables<'trades'>[];
}

type SortableKey = keyof Pick<Tables<'trades'>, 'datetime' | 'symbol' | 'side' | 'qty' | 'price' | 'pnl'>;

const TradesLogTable = ({ trades }: TradesLogTableProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // State for filters and controls
  const [filters, setFilters] = useState({
    symbol: '',
    side: 'All' as 'All' | 'BUY' | 'SELL',
    strategy: 'All',
    dateRange: 'All',
    pnlRange: 'All',
    searchTerm: '',
  });

  const [sortConfig, setSortConfig] = useState<{ key: SortableKey; direction: 'ascending' | 'descending' } | null>({
    key: 'datetime',
    direction: 'descending',
  });

  const [editingTrade, setEditingTrade] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Tables<'trades'>>>({});
  const [tradeToDelete, setTradeToDelete] = useState<string | null>(null);
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Calculate quick stats
  const stats = useMemo(() => {
    const winners = trades.filter(t => (t.pnl || 0) > 0);
    const losers = trades.filter(t => (t.pnl || 0) < 0);
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + (t.pnl || 0), 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((sum, t) => sum + (t.pnl || 0), 0) / losers.length : 0;
    
    return {
      total: trades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: trades.length > 0 ? (winners.length / trades.length) * 100 : 0,
      totalPnl,
      avgWin,
      avgLoss,
      largestWin: winners.length > 0 ? Math.max(...winners.map(t => t.pnl || 0)) : 0,
      largestLoss: losers.length > 0 ? Math.min(...losers.map(t => t.pnl || 0)) : 0,
    };
  }, [trades]);

  // Mutations for trade operations
  const updateTradeMutation = useMutation({
    mutationFn: async ({ tradeId, updates }: { tradeId: string; updates: Partial<Tables<'trades'>> }) => {
      console.log('Updating trade:', tradeId, updates);
      
      const cleanedUpdates = {
        ...updates,
        qty: updates.qty ? Number(updates.qty) : undefined,
        price: updates.price ? Number(updates.price) : undefined,
        pnl: updates.pnl ? Number(updates.pnl) : undefined,
      };
      
      Object.keys(cleanedUpdates).forEach(key => {
        if (cleanedUpdates[key as keyof typeof cleanedUpdates] === undefined) {
          delete cleanedUpdates[key as keyof typeof cleanedUpdates];
        }
      });
      
      const { data, error } = await supabase
        .from('trades')
        .update(cleanedUpdates)
        .eq('id', tradeId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalWithSessions'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      toast({ title: "Success", description: "Trade updated successfully." });
      setEditingTrade(null);
      setEditFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTradeMutation = useMutation({
    mutationFn: async (tradeId: string) => {
      const { error } = await supabase
        .from('trades')
        .delete()
        .eq('id', tradeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalWithSessions'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      toast({ title: "Success", description: "Trade deleted successfully." });
      setTradeToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Filter and sort logic
  const sortedAndFilteredTrades = useMemo(() => {
    let filteredTrades = [...trades];

    // Apply filters
    if (filters.searchTerm) {
      filteredTrades = filteredTrades.filter(trade =>
        trade.symbol?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        trade.notes?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        (trade as any).strategy?.toLowerCase().includes(filters.searchTerm.toLowerCase())
      );
    }

    if (filters.symbol) {
      filteredTrades = filteredTrades.filter(trade =>
        trade.symbol?.toLowerCase().includes(filters.symbol.toLowerCase())
      );
    }

    if (filters.side !== 'All') {
      filteredTrades = filteredTrades.filter(trade => trade.side?.toUpperCase() === filters.side);
    }

    if (filters.pnlRange !== 'All') {
      filteredTrades = filteredTrades.filter(trade => {
        const pnl = trade.pnl || 0;
        switch (filters.pnlRange) {
          case 'Winners': return pnl > 0;
          case 'Losers': return pnl < 0;
          case 'Breakeven': return pnl === 0;
          case 'Big Winners': return pnl > 100;
          case 'Big Losers': return pnl < -100;
          default: return true;
        }
      });
    }

    // Apply sorting
    if (sortConfig) {
      filteredTrades.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }

    return filteredTrades;
  }, [trades, filters, sortConfig]);

  // Helper functions
  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const requestSort = (key: SortableKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleEditTrade = (trade: Tables<'trades'>) => {
    setEditingTrade(trade.id);
    setEditFormData({
      symbol: trade.symbol || '',
      side: trade.side || 'BUY',
      qty: trade.qty || 0,
      price: trade.price || 0,
      pnl: trade.pnl || 0,
      notes: trade.notes || '',
      strategy: (trade as any).strategy || '',
      tags: (trade as any).tags || [],
    });
  };

  const handleSaveEdit = () => {
    if (!editingTrade) return;
    updateTradeMutation.mutate({ tradeId: editingTrade, updates: editFormData });
  };

  const handleCancelEdit = () => {
    setEditingTrade(null);
    setEditFormData({});
  };

  const handleViewNotes = (tradeId: string) => {
    navigate(`/trade-notes/${tradeId}`);
  };

  const handleDeleteTrade = (tradeId: string) => {
    deleteTradeMutation.mutate(tradeId);
  };

  const exportTrades = () => {
    // Implementation for CSV export
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Symbol,Side,Qty,Price,P&L,Strategy,Notes\n"
      + sortedAndFilteredTrades.map(trade => 
          `${trade.datetime ? format(new Date(trade.datetime), 'yyyy-MM-dd HH:mm') : ''},${trade.symbol || ''},${trade.side || ''},${trade.qty || 0},${trade.price || 0},${trade.pnl || 0},"${(trade as any).strategy || ''}","${trade.notes || ''}"`
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `trades_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getSortIcon = (key: SortableKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <SortAsc className="w-4 h-4 opacity-30" />;
    }
    return sortConfig.direction === 'ascending' ? 
      <SortAsc className="w-4 h-4 text-blue-600" /> : 
      <SortDesc className="w-4 h-4 text-blue-600" />;
  };

  const SortableHeader = ({ sortKey, children }: { sortKey: SortableKey; children: React.ReactNode }) => (
    <TableHead 
      className="cursor-pointer hover:bg-slate-50 transition-colors select-none" 
      onClick={() => requestSort(sortKey)}
    >
      <div className="flex items-center space-x-1">
        {children}
        {getSortIcon(sortKey)}
      </div>
    </TableHead>
  );

  if (!trades || trades.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
        <BarChart3 className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Trades Found</h3>
        <p className="text-slate-500">Upload your trading data or add trades manually to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <TooltipProvider>
          <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-blue-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Total Trades</p>
                  <p className="text-2xl font-bold text-blue-800">{stats.total}</p>
                </div>
                <Activity className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-gradient-to-r from-green-50 to-green-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Win Rate</p>
                  <p className="text-2xl font-bold text-green-800">{stats.winRate.toFixed(1)}%</p>
                </div>
                <Target className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className={`border-0 shadow-md ${stats.totalPnl >= 0 ? 'bg-gradient-to-r from-emerald-50 to-emerald-100' : 'bg-gradient-to-r from-red-50 to-red-100'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xs font-medium uppercase tracking-wide ${stats.totalPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Total P&L</p>
                  <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                    {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
                  </p>
                </div>
                <DollarSign className={`w-8 h-8 ${stats.totalPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-gradient-to-r from-purple-50 to-purple-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">Winners</p>
                  <p className="text-2xl font-bold text-purple-800">{stats.winners}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-gradient-to-r from-orange-50 to-orange-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">Losers</p>
                  <p className="text-2xl font-bold text-orange-800">{stats.losers}</p>
                </div>
                <TrendingDown className="w-8 h-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-0 shadow-md bg-gradient-to-r from-cyan-50 to-cyan-100">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-cyan-600 uppercase tracking-wide">Avg Win</p>
                      <p className="text-xl font-bold text-cyan-800">${stats.avgWin.toFixed(0)}</p>
                    </div>
                    <Zap className="w-6 h-6 text-cyan-600" />
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>Average profit per winning trade</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-0 shadow-md bg-gradient-to-r from-pink-50 to-pink-100">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-pink-600 uppercase tracking-wide">Avg Loss</p>
                      <p className="text-xl font-bold text-pink-800">${Math.abs(stats.avgLoss).toFixed(0)}</p>
                    </div>
                    <TrendingDown className="w-6 h-6 text-pink-600" />
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>Average loss per losing trade</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Enhanced Filters and Controls */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div>
              <CardTitle className="text-xl font-bold text-slate-800">Trade Log Analysis</CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                Showing {sortedAndFilteredTrades.length} of {trades.length} trades
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
                className="hidden md:flex"
              >
                {viewMode === 'table' ? <BarChart3 className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {viewMode === 'table' ? 'Card View' : 'Table View'}
              </Button>
              
              <Button variant="outline" size="sm" onClick={exportTrades}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Enhanced Filter Bar */}
          <div className="flex flex-col lg:flex-row gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search by symbol, notes, or strategy..."
                value={filters.searchTerm}
                onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
                className="pl-10 bg-white"
              />
            </div>
            
            <Select value={filters.side} onValueChange={(value) => handleFilterChange('side', value)}>
              <SelectTrigger className="w-[120px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Sides</SelectItem>
                <SelectItem value="BUY">Buy Only</SelectItem>
                <SelectItem value="SELL">Sell Only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.pnlRange} onValueChange={(value) => handleFilterChange('pnlRange', value)}>
              <SelectTrigger className="w-[140px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All P&L</SelectItem>
                <SelectItem value="Winners">Winners Only</SelectItem>
                <SelectItem value="Losers">Losers Only</SelectItem>
                <SelectItem value="Breakeven">Breakeven</SelectItem>
                <SelectItem value="Big Winners">Big Winners ($100+)</SelectItem>
                <SelectItem value="Big Losers">Big Losers ($100+)</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setFilters({
                symbol: '',
                side: 'All',
                strategy: 'All',
                dateRange: 'All',
                pnlRange: 'All',
                searchTerm: '',
              })}
            >
              <X className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>

          {/* Enhanced Trade Table */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="border-b border-slate-200">
                  <SortableHeader sortKey="datetime">
                    <Clock className="w-4 h-4 mr-2 text-slate-600" />
                    <span className="font-semibold text-slate-700">Date & Time</span>
                  </SortableHeader>
                  <SortableHeader sortKey="symbol">
                    <span className="font-semibold text-slate-700">Symbol</span>
                  </SortableHeader>
                  <SortableHeader sortKey="side">
                    <span className="font-semibold text-slate-700">Side</span>
                  </SortableHeader>
                  <SortableHeader sortKey="qty">
                    <span className="font-semibold text-slate-700">Quantity</span>
                  </SortableHeader>
                  <SortableHeader sortKey="price">
                    <span className="font-semibold text-slate-700">Price</span>
                  </SortableHeader>
                  <SortableHeader sortKey="pnl">
                    <DollarSign className="w-4 h-4 mr-2 text-slate-600" />
                    <span className="font-semibold text-slate-700">P&L</span>
                  </SortableHeader>
                  <TableHead className="font-semibold text-slate-700">Strategy</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tags</TableHead>
                  <TableHead className="font-semibold text-slate-700">Notes</TableHead>
                  <TableHead className="font-semibold text-slate-700">Chart</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAndFilteredTrades.map((trade, index) => (
                  <TableRow 
                    key={trade.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      (trade.pnl || 0) > 0 ? 'border-l-2 border-l-green-500' : 
                      (trade.pnl || 0) < 0 ? 'border-l-2 border-l-red-500' : 
                      'border-l-2 border-l-gray-300'
                    }`}
                  >
                    <TableCell className="py-4">
                      <div className="space-y-1">
                        <div className="font-medium text-slate-800">
                          {trade.datetime ? format(new Date(trade.datetime), 'MMM dd, yyyy') : 'N/A'}
                        </div>
                        <div className="text-sm text-slate-500">
                          {trade.datetime ? format(new Date(trade.datetime), 'HH:mm:ss') : ''}
                        </div>
                      </div>
                    </TableCell>
                    
                    <TableCell className="py-4">
                      {editingTrade === trade.id ? (
                        <Input
                          value={editFormData.symbol || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, symbol: e.target.value }))}
                          className="w-20 h-8"
                        />
                      ) : (
                        <Badge variant="outline" className="font-mono font-semibold">
                          {trade.symbol || 'N/A'}
                        </Badge>
                      )}
                    </TableCell>
                    
                    <TableCell className="py-4">
                      {editingTrade === trade.id ? (
                        <select
                          value={editFormData.side || 'BUY'}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, side: e.target.value as 'BUY' | 'SELL' }))}
                          className="w-20 h-8 border rounded px-2"
                        >
                          <option value="BUY">BUY</option>
                          <option value="SELL">SELL</option>
                        </select>
                      ) : (
                        <Badge 
                          variant={trade.side?.toUpperCase() === 'BUY' ? 'default' : 'destructive'}
                          className={`font-semibold ${
                            trade.side?.toUpperCase() === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {trade.side?.toUpperCase() || 'N/A'}
                        </Badge>
                      )}
                    </TableCell>
                    
                    <TableCell className="py-4">
                      {editingTrade === trade.id ? (
                        <Input
                          type="number"
                          value={editFormData.qty || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, qty: Number(e.target.value) }))}
                          className="w-20 h-8"
                        />
                      ) : (
                        <span className="font-medium">{(trade.qty || 0).toLocaleString()}</span>
                      )}
                    </TableCell>
                    
                    <TableCell className="py-4">
                      {editingTrade === trade.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editFormData.price || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
                          className="w-24 h-8"
                        />
                      ) : (
                        <span className="font-mono">${(trade.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      )}
                    </TableCell>
                    
                    <TableCell className="py-4">
                      {editingTrade === trade.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editFormData.pnl || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, pnl: Number(e.target.value) }))}
                          className="w-24 h-8"
                        />
                      ) : (
                        <div className="flex items-center space-x-1">
                          {(trade.pnl || 0) >= 0 ? (
                            <TrendingUp className="w-4 h-4 text-green-600" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                          )}
                          <span className={`font-bold ${(trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {(trade.pnl || 0) >= 0 ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    
                    <TableCell className="py-4">
                      {editingTrade === trade.id ? (
                        <Input
                          value={editFormData.strategy || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, strategy: e.target.value }))}
                          className="w-24 h-8"
                          placeholder="Strategy"
                        />
                      ) : (
                        <span className="text-sm font-medium text-slate-700">
                          {(trade as any).strategy || '-'}
                        </span>
                      )}
                    </TableCell>
                    
                    <TableCell className="py-4 max-w-[150px]">
                      <div className="flex flex-wrap gap-1">
                        {(trade as any).tags?.slice(0, 2).map((tag: string, index: number) => (
                          <Badge key={`${trade.id}-${tag}-${index}`} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {(trade as any).tags?.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{(trade as any).tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell className="py-4 max-w-[200px]">
                      {editingTrade === trade.id ? (
                        <Input
                          value={editFormData.notes || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, notes: e.target.value }))}
                          className="w-32 h-8"
                          placeholder="Quick notes..."
                        />
                      ) : (
                        <span className="text-slate-600 truncate text-sm">
                          {trade.notes || '-'}
                        </span>
                      )}
                    </TableCell>
                    
                    <TableCell className="py-4">
                      {(trade as any).image_url ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={(trade as any).image_url} target="_blank" rel="noopener noreferrer">
                            <Eye className="w-4 h-4" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </TableCell>
                    
                    <TableCell className="py-4">
                      {editingTrade === trade.id ? (
                        <div className="flex space-x-1">
                          <Button size="sm" variant="outline" onClick={handleSaveEdit} disabled={updateTradeMutation.isPending}>
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Trade Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEditTrade(trade)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Quick Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewNotes(trade.id)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Detailed Notes
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => setTradeToDelete(trade.id)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Trade
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination placeholder - if needed for large datasets */}
          {sortedAndFilteredTrades.length === 0 && (
            <div className="text-center py-8">
              <Search className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No trades match your filters</h3>
              <p className="text-slate-500">Try adjusting your search criteria or clear all filters.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!tradeToDelete} onOpenChange={() => setTradeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trade</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trade? This action cannot be undone and will permanently remove the trade from your journal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => tradeToDelete && handleDeleteTrade(tradeToDelete)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteTradeMutation.isPending}
            >
              {deleteTradeMutation.isPending ? 'Deleting...' : 'Delete Trade'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TradesLogTable;