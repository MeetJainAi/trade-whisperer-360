import { useMemo, useState, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tables } from "@/integrations/supabase/types";
import { format } from 'date-fns';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { 
  ListFilter, 
  SortAsc, 
  SortDesc, 
  Edit, 
  FileText, 
  MoreHorizontal, 
  Save, 
  X, 
  Trash2, 
  Search, 
  Download, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Clock, 
  DollarSign, 
  Activity, 
  BarChart3, 
  Eye, 
  Filter, 
  ChevronDown,
  ChevronsUpDown,
  ArrowUpRight,
  Zap,
  Copy,
  FileUp,
  Percent,
  Wallet,
  BadgeDollarSign
} from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TradesLogTableProps {
  trades: Tables<'trades'>[];
}

type SortableKey = keyof Pick<Tables<'trades'>, 'datetime' | 'symbol' | 'side' | 'qty' | 'price' | 'pnl'>;

const extractNotes = (notes: string | null): {
  simple: string;
  detailed: {
    reasoning?: string;
    emotions?: string;
    lessons?: string;
    mistakes?: string;
  }
} => {
  if (!notes) return { simple: '', detailed: {} };
  
  try {
    const parsed = JSON.parse(notes);
    if (typeof parsed === 'object') {
      return {
        simple: parsed.reasoning?.substring(0, 100) || '',
        detailed: parsed
      };
    }
  } catch (e) {
    // Not JSON, treat as simple notes
  }
  
  return {
    simple: notes,
    detailed: {}
  };
};

const TradesLogTable = ({ trades }: TradesLogTableProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const exportRef = useRef<HTMLAnchorElement>(null);
  
  // State for views, filters and controls
  const [activeTab, setActiveTab] = useState<"table" | "stats" | "patterns">("table");
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const [filters, setFilters] = useState({
    symbol: '',
    side: 'All' as 'All' | 'BUY' | 'SELL',
    strategy: 'All',
    dateRange: 'All',
    pnlRange: 'All',
    searchTerm: '',
    showOnlyWithNotes: false,
    tags: [] as string[]
  });

  const [sortConfig, setSortConfig] = useState<{ key: SortableKey; direction: 'ascending' | 'descending' } | null>({
    key: 'datetime',
    direction: 'descending',
  });

  const [editingTrade, setEditingTrade] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Tables<'trades'>>>({});
  const [tradeToDelete, setTradeToDelete] = useState<string | null>(null);
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());

  // Extract all available strategies and tags for filtering
  const availableStrategies = useMemo(() => {
    const strategies = new Set<string>();
    trades.forEach(trade => {
      if ((trade as any).strategy) {
        strategies.add((trade as any).strategy);
      }
    });
    return Array.from(strategies);
  }, [trades]);
  
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    trades.forEach(trade => {
      if ((trade as any).tags && Array.isArray((trade as any).tags)) {
        (trade as any).tags.forEach((tag: string) => tags.add(tag));
      }
    });
    return Array.from(tags);
  }, [trades]);
  
  const allSymbols = useMemo(() => {
    return [...new Set(trades.map(t => t.symbol).filter(Boolean))];
  }, [trades]);

  // Calculate trading metrics
  const metrics = useMemo(() => {
    if (!trades.length) return null;
    
    const winners = trades.filter(t => (t.pnl || 0) > 0);
    const losers = trades.filter(t => (t.pnl || 0) < 0);
    const breakeven = trades.filter(t => (t.pnl || 0) === 0);
    
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgWin = winners.length ? winners.reduce((sum, t) => sum + (t.pnl || 0), 0) / winners.length : 0;
    const avgLoss = losers.length ? losers.reduce((sum, t) => sum + (t.pnl || 0), 0) / losers.length : 0;
    
    const winRate = trades.length ? (winners.length / trades.length) * 100 : 0;
    const lossRate = trades.length ? (losers.length / trades.length) * 100 : 0;
    const breakevenRate = trades.length ? (breakeven.length / trades.length) * 100 : 0;
    
    const profitFactor = Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : 0;
    
    // Calculate best and worst symbols
    const symbolStats = {} as Record<string, {wins: number, losses: number, total: number, pnl: number}>;
    trades.forEach(trade => {
      const symbol = trade.symbol || 'Unknown';
      if (!symbolStats[symbol]) {
        symbolStats[symbol] = {wins: 0, losses: 0, total: 0, pnl: 0};
      }
      symbolStats[symbol].total++;
      symbolStats[symbol].pnl += (trade.pnl || 0);
      if ((trade.pnl || 0) > 0) symbolStats[symbol].wins++;
      if ((trade.pnl || 0) < 0) symbolStats[symbol].losses++;
    });
    
    const symbolRanking = Object.entries(symbolStats)
      .map(([symbol, stats]) => ({
        symbol,
        ...stats,
        winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0
      }))
      .sort((a, b) => b.pnl - a.pnl);
      
    const bestSymbols = symbolRanking.slice(0, 3);
    const worstSymbols = [...symbolRanking].sort((a, b) => a.pnl - b.pnl).slice(0, 3);
    
    return {
      total: trades.length,
      winners: winners.length,
      losers: losers.length,
      breakeven: breakeven.length,
      totalPnl,
      avgWin,
      avgLoss,
      winRate,
      lossRate,
      breakevenRate,
      profitFactor,
      largestWin: Math.max(...winners.map(t => t.pnl || 0), 0),
      largestLoss: Math.min(...losers.map(t => t.pnl || 0), 0),
      avgTradeValue: trades.length ? totalPnl / trades.length : 0,
      bestSymbols,
      worstSymbols,
      symbolStats
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

  const duplicateTradeMutation = useMutation({
    mutationFn: async (tradeId: string) => {
      // Get the trade to duplicate
      const { data: tradeToDuplicate, error: fetchError } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();
        
      if (fetchError) throw fetchError;
      
      // Create a new trade based on the original
      const { id, created_at, ...tradeData } = tradeToDuplicate;
      
      const { data: newTrade, error: insertError } = await supabase
        .from('trades')
        .insert(tradeData)
        .select()
        .single();
        
      if (insertError) throw insertError;
      return newTrade;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalWithSessions'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
      toast({ title: "Success", description: "Trade duplicated successfully." });
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
      const searchLower = filters.searchTerm.toLowerCase();
      filteredTrades = filteredTrades.filter(trade =>
        trade.symbol?.toLowerCase().includes(searchLower) ||
        trade.notes?.toLowerCase().includes(searchLower) ||
        (trade as any).strategy?.toLowerCase().includes(searchLower)
      );
    }

    if (filters.symbol) {
      filteredTrades = filteredTrades.filter(trade =>
        trade.symbol?.toLowerCase() === filters.symbol.toLowerCase()
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
          case 'Big Winners': return pnl >= 100;
          case 'Big Losers': return pnl <= -100;
          default: return true;
        }
      });
    }

    if (filters.strategy !== 'All') {
      filteredTrades = filteredTrades.filter(trade => 
        (trade as any).strategy === filters.strategy
      );
    }
    
    if (filters.tags.length > 0) {
      filteredTrades = filteredTrades.filter(trade => {
        const tradeTags = (trade as any).tags || [];
        return filters.tags.some(tag => tradeTags.includes(tag));
      });
    }
    
    if (filters.showOnlyWithNotes) {
      filteredTrades = filteredTrades.filter(trade => 
        trade.notes && trade.notes.length > 0
      );
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
  
  // Pattern analysis: detect streaks, best/worst days
  const patterns = useMemo(() => {
    if (!trades.length) return null;
    
    // Group trades by day
    const tradingDays = trades.reduce((acc, trade) => {
      if (!trade.datetime) return acc;
      
      const day = format(new Date(trade.datetime), 'yyyy-MM-dd');
      if (!acc[day]) {
        acc[day] = {
          date: day,
          trades: [],
          totalPnL: 0,
          winners: 0,
          losers: 0
        };
      }
      
      acc[day].trades.push(trade);
      acc[day].totalPnL += (trade.pnl || 0);
      if ((trade.pnl || 0) > 0) acc[day].winners++;
      if ((trade.pnl || 0) < 0) acc[day].losers++;
      
      return acc;
    }, {} as Record<string, {date: string, trades: Tables<'trades'>[], totalPnL: number, winners: number, losers: number}>);
    
    // Calculate best and worst trading days
    const tradingDaysList = Object.values(tradingDays);
    const bestDays = [...tradingDaysList].sort((a, b) => b.totalPnL - a.totalPnL).slice(0, 3);
    const worstDays = [...tradingDaysList].sort((a, b) => a.totalPnL - b.totalPnL).slice(0, 3);
    
    // Detect streaks
    let currentStreak = { type: 'none', length: 0, amount: 0 };
    let longestWinStreak = { length: 0, amount: 0 };
    let longestLossStreak = { length: 0, amount: 0 };
    let currentStreakTrades: Tables<'trades'>[] = [];
    let biggestWinStreak: Tables<'trades'>[] = [];
    let biggestLossStreak: Tables<'trades'>[] = [];
    
    // Sort trades by datetime
    const sortedTrades = [...trades]
      .filter(t => t.datetime)
      .sort((a, b) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime());
      
    sortedTrades.forEach(trade => {
      const pnl = trade.pnl || 0;
      
      if (pnl > 0) { // Win
        if (currentStreak.type === 'win') {
          currentStreak.length++;
          currentStreak.amount += pnl;
          currentStreakTrades.push(trade);
        } else {
          currentStreak = { type: 'win', length: 1, amount: pnl };
          currentStreakTrades = [trade];
        }
        
        if (currentStreak.length > longestWinStreak.length) {
          longestWinStreak = { length: currentStreak.length, amount: currentStreak.amount };
          biggestWinStreak = [...currentStreakTrades];
        }
      } 
      else if (pnl < 0) { // Loss
        if (currentStreak.type === 'loss') {
          currentStreak.length++;
          currentStreak.amount += pnl;
          currentStreakTrades.push(trade);
        } else {
          currentStreak = { type: 'loss', length: 1, amount: pnl };
          currentStreakTrades = [trade];
        }
        
        if (currentStreak.length > longestLossStreak.length) {
          longestLossStreak = { length: currentStreak.length, amount: currentStreak.amount };
          biggestLossStreak = [...currentStreakTrades];
        }
      } 
      else { // Breakeven
        currentStreak = { type: 'none', length: 0, amount: 0 };
        currentStreakTrades = [];
      }
    });
    
    // Group by time of day
    const timeOfDay = {} as Record<string, {
      hour: number,
      trades: number,
      winners: number,
      losers: number,
      totalPnL: number
    }>;
    
    sortedTrades.forEach(trade => {
      if (!trade.datetime) return;
      
      const hour = new Date(trade.datetime).getHours();
      const hourKey = `${hour}`;
      
      if (!timeOfDay[hourKey]) {
        timeOfDay[hourKey] = {
          hour,
          trades: 0,
          winners: 0,
          losers: 0,
          totalPnL: 0
        };
      }
      
      timeOfDay[hourKey].trades++;
      timeOfDay[hourKey].totalPnL += (trade.pnl || 0);
      if ((trade.pnl || 0) > 0) timeOfDay[hourKey].winners++;
      if ((trade.pnl || 0) < 0) timeOfDay[hourKey].losers++;
    });
    
    // Find best and worst hours
    const timeOfDayList = Object.values(timeOfDay);
    const bestHours = [...timeOfDayList]
      .filter(h => h.trades >= 3) // Minimum sample size
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, 3);
    const worstHours = [...timeOfDayList]
      .filter(h => h.trades >= 3) // Minimum sample size
      .sort((a, b) => a.totalPnL - b.totalPnL)
      .slice(0, 3);
      
    return {
      bestDays,
      worstDays,
      longestWinStreak,
      longestLossStreak,
      biggestWinStreak,
      biggestLossStreak,
      bestHours,
      worstHours
    };
  }, [trades]);

  // Helper functions
  const handleFilterChange = (key: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      symbol: '',
      side: 'All',
      strategy: 'All',
      dateRange: 'All',
      pnlRange: 'All',
      searchTerm: '',
      showOnlyWithNotes: false,
      tags: []
    });
  };
  
  const toggleTagFilter = (tag: string) => {
    setFilters(prev => {
      if (prev.tags.includes(tag)) {
        return {...prev, tags: prev.tags.filter(t => t !== tag)};
      } else {
        return {...prev, tags: [...prev.tags, tag]};
      }
    });
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

  const handleDuplicateTrade = (tradeId: string) => {
    duplicateTradeMutation.mutate(tradeId);
  };

  const exportTrades = () => {
    const csvRows = [];
    
    // Column headers
    const headers = [
      'Date', 'Time', 'Symbol', 'Side', 'Quantity', 'Price', 'P&L', 
      'Strategy', 'Notes', 'Tags'
    ];
    csvRows.push(headers.join(','));
    
    // Add data rows
    sortedAndFilteredTrades.forEach(trade => {
      const dateTime = trade.datetime ? new Date(trade.datetime) : null;
      const dateFormatted = dateTime ? format(dateTime, 'yyyy-MM-dd') : '';
      const timeFormatted = dateTime ? format(dateTime, 'HH:mm:ss') : '';
      
      const row = [
        dateFormatted,
        timeFormatted,
        `"${trade.symbol || ''}"`,
        `"${trade.side || ''}"`,
        trade.qty || 0,
        trade.price || 0,
        trade.pnl || 0,
        `"${(trade as any).strategy || ''}"`,
        `"${trade.notes?.replace(/"/g, '""') || ''}"`,
        `"${((trade as any).tags || []).join(', ')}"`
      ];
      
      csvRows.push(row.join(','));
    });
    
    // Create and download the CSV file
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trades_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getSortIcon = (key: SortableKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ChevronsUpDown className="w-4 h-4 text-slate-400" />;
    }
    return sortConfig.direction === 'ascending' ? 
      <SortAsc className="w-4 h-4 text-blue-600" /> : 
      <SortDesc className="w-4 h-4 text-blue-600" />;
  };

  const SortableHeader = ({ sortKey, children }: { sortKey: SortableKey; children: React.ReactNode }) => (
    <TableHead 
      className="cursor-pointer hover:bg-slate-50 transition-colors select-none px-4 py-3.5" 
      onClick={() => requestSort(sortKey)}
    >
      <div className="flex items-center space-x-1">
        {children}
        {getSortIcon(sortKey)}
      </div>
    </TableHead>
  );
  
  const formatPnL = (pnl: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(pnl);
  };

  if (!trades || trades.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
        <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-800 mb-2">No Trades Found</h3>
        <p className="text-slate-500 max-w-md mx-auto mb-6">
          Upload your trading data via CSV or add trades manually to start analyzing your performance.
        </p>
        <div className="flex justify-center space-x-4">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <FileUp className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Button variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Manual Entry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <TabsList className="grid w-full md:w-auto grid-cols-3 mb-4 md:mb-0">
            <TabsTrigger value="table" className="px-4">
              <Eye className="w-4 h-4 mr-2" />
              Trade Log
            </TabsTrigger>
            <TabsTrigger value="stats" className="px-4">
              <Activity className="w-4 h-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="patterns" className="px-4">
              <Zap className="w-4 h-4 mr-2" />
              Patterns
            </TabsTrigger>
          </TabsList>
          
          <div className="flex flex-wrap items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={exportTrades}>
                    <Download className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Export trades to CSV</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <TabsContent value="table" className="space-y-6">
          {/* Quick Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            <TooltipProvider>
              <Card className="border border-slate-200 shadow-sm bg-white hover:border-blue-200 hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Trades</p>
                      <p className="text-2xl font-bold text-slate-800">{metrics?.total || 0}</p>
                    </div>
                    <Activity className="w-8 h-8 text-blue-500 opacity-80" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm bg-white hover:border-green-200 hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Win Rate</p>
                      <p className="text-2xl font-bold text-slate-800">{metrics?.winRate.toFixed(1)}%</p>
                    </div>
                    <Target className="w-8 h-8 text-green-500 opacity-80" />
                  </div>
                </CardContent>
              </Card>

              <Card className={`border shadow-sm bg-white transition-all ${
                (metrics?.totalPnl || 0) >= 0 
                  ? 'hover:border-green-200 hover:shadow-md' 
                  : 'hover:border-red-200 hover:shadow-md'
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total P&L</p>
                      <p className={`text-2xl font-bold ${
                        (metrics?.totalPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatPnL(metrics?.totalPnl || 0)}
                      </p>
                    </div>
                    <DollarSign className={`w-8 h-8 opacity-80 ${
                      (metrics?.totalPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                    }`} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm bg-white hover:border-indigo-200 hover:shadow-md transition-all hidden sm:block">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Avg Per Trade</p>
                      <p className={`text-2xl font-bold ${
                        (metrics?.avgTradeValue || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatPnL(metrics?.avgTradeValue || 0)}
                      </p>
                    </div>
                    <BadgeDollarSign className="w-8 h-8 text-indigo-500 opacity-80" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm bg-white hover:border-purple-200 hover:shadow-md transition-all hidden lg:block">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Profit Factor</p>
                      <p className="text-2xl font-bold text-slate-800">
                        {metrics?.profitFactor ? metrics.profitFactor.toFixed(2) : 'N/A'}
                      </p>
                    </div>
                    <Percent className="w-8 h-8 text-purple-500 opacity-80" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm bg-white hover:border-amber-200 hover:shadow-md transition-all hidden lg:block">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Largest Win</p>
                      <p className="text-2xl font-bold text-green-600">{formatPnL(metrics?.largestWin || 0)}</p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-amber-500 opacity-80" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm bg-white hover:border-cyan-200 hover:shadow-md transition-all hidden lg:block">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Largest Loss</p>
                      <p className="text-2xl font-bold text-red-600">{formatPnL(Math.abs(metrics?.largestLoss || 0))}</p>
                    </div>
                    <TrendingDown className="w-8 h-8 text-cyan-500 opacity-80" />
                  </div>
                </CardContent>
              </Card>
            </TooltipProvider>
          </div>

          {/* Enhanced Filter Bar */}
          <Card className="border border-slate-200 shadow-sm bg-white">
            <CardHeader className="p-4 pb-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-2">
                  <Filter className="w-5 h-5 text-slate-500" />
                  <CardTitle className="text-xl">Filter Trades</CardTitle>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={resetFilters} 
                  className="text-slate-600 hover:text-slate-900"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear Filters
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="p-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Search symbol, notes, strategy..."
                    value={filters.searchTerm}
                    onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
                    className="pl-10 border-slate-300"
                  />
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between border-slate-300">
                      <div className="flex items-center">
                        <Target className="w-4 h-4 mr-2" />
                        <span>{filters.side === 'All' ? 'All Sides' : filters.side}</span>
                      </div>
                      <ChevronDown className="w-4 h-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuLabel>Filter by Side</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleFilterChange('side', 'All')}>
                      All Sides
                      {filters.side === 'All' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('side', 'BUY')}>
                      <Badge className="bg-green-100 text-green-800 font-normal mr-2">BUY</Badge>
                      Buy Only
                      {filters.side === 'BUY' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('side', 'SELL')}>
                      <Badge className="bg-red-100 text-red-800 font-normal mr-2">SELL</Badge>
                      Sell Only
                      {filters.side === 'SELL' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between border-slate-300">
                      <div className="flex items-center">
                        <DollarSign className="w-4 h-4 mr-2" />
                        <span>{filters.pnlRange === 'All' ? 'All Results' : filters.pnlRange}</span>
                      </div>
                      <ChevronDown className="w-4 h-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuLabel>Filter by P&L</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleFilterChange('pnlRange', 'All')}>
                      All Results
                      {filters.pnlRange === 'All' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('pnlRange', 'Winners')}>
                      <TrendingUp className="w-4 h-4 mr-2 text-green-600" />
                      Winning Trades
                      {filters.pnlRange === 'Winners' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('pnlRange', 'Losers')}>
                      <TrendingDown className="w-4 h-4 mr-2 text-red-600" />
                      Losing Trades
                      {filters.pnlRange === 'Losers' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('pnlRange', 'Big Winners')}>
                      <Zap className="w-4 h-4 mr-2 text-amber-500" />
                      Big Winners ($100+)
                      {filters.pnlRange === 'Big Winners' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('pnlRange', 'Big Losers')}>
                      <AlertCircle className="w-4 h-4 mr-2 text-orange-500" />
                      Big Losers (-$100+)
                      {filters.pnlRange === 'Big Losers' && <Check className="w-4 h-4 ml-auto" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              {/* Additional filters - collapsible section */}
              <div className="mt-4 space-y-4">
                <Separator />
                
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
                  {/* Symbol dropdown */}
                  {allSymbols.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between border-slate-300">
                          <div className="flex items-center">
                            <Hash className="w-4 h-4 mr-2" />
                            <span>{filters.symbol || 'All Symbols'}</span>
                          </div>
                          <ChevronDown className="w-4 h-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56 max-h-[300px] overflow-y-auto">
                        <DropdownMenuLabel>Filter by Symbol</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleFilterChange('symbol', '')}>
                          All Symbols
                          {!filters.symbol && <Check className="w-4 h-4 ml-auto" />}
                        </DropdownMenuItem>
                        {allSymbols.map(symbol => (
                          <DropdownMenuItem 
                            key={symbol} 
                            onClick={() => handleFilterChange('symbol', symbol)}
                          >
                            <Badge variant="outline" className="font-mono mr-2">{symbol}</Badge>
                            {filters.symbol === symbol && <Check className="w-4 h-4 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  
                  {/* Strategy dropdown */}
                  {availableStrategies.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between border-slate-300">
                          <div className="flex items-center">
                            <Zap className="w-4 h-4 mr-2" />
                            <span>{filters.strategy === 'All' ? 'All Strategies' : filters.strategy}</span>
                          </div>
                          <ChevronDown className="w-4 h-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56 max-h-[300px] overflow-y-auto">
                        <DropdownMenuLabel>Filter by Strategy</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleFilterChange('strategy', 'All')}>
                          All Strategies
                          {filters.strategy === 'All' && <Check className="w-4 h-4 ml-auto" />}
                        </DropdownMenuItem>
                        {availableStrategies.map(strategy => (
                          <DropdownMenuItem 
                            key={strategy} 
                            onClick={() => handleFilterChange('strategy', strategy)}
                          >
                            {strategy}
                            {filters.strategy === strategy && <Check className="w-4 h-4 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  
                  {/* Tags multi-select */}
                  {availableTags.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between border-slate-300">
                          <div className="flex items-center">
                            <Tags className="w-4 h-4 mr-2" />
                            <span>
                              {filters.tags.length === 0 ? 'All Tags' : 
                               filters.tags.length === 1 ? `1 Tag Selected` : 
                               `${filters.tags.length} Tags Selected`}
                            </span>
                          </div>
                          <ChevronDown className="w-4 h-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56 max-h-[300px] overflow-y-auto">
                        <DropdownMenuLabel>Filter by Tags</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        
                        {availableTags.map(tag => (
                          <DropdownMenuCheckboxItem
                            key={tag}
                            checked={filters.tags.includes(tag)}
                            onCheckedChange={() => toggleTagFilter(tag)}
                          >
                            <Badge variant="outline" className="mr-2 font-normal">{tag}</Badge>
                          </DropdownMenuCheckboxItem>
                        ))}
                        
                        {filters.tags.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleFilterChange('tags', [])}
                              className="justify-center text-blue-600"
                            >
                              Clear Tag Filters
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trade Table */}
          <Card className="border border-slate-200 shadow-sm bg-white">
            <CardHeader className="px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ListFilter className="w-5 h-5 text-slate-500" />
                  <CardTitle className="text-lg">
                    {sortedAndFilteredTrades.length} {sortedAndFilteredTrades.length === 1 ? 'Trade' : 'Trades'}
                  </CardTitle>
                </div>
                <div className="flex items-center space-x-2">
                  <Select 
                    value={viewMode} 
                    onValueChange={(v) => setViewMode(v as 'compact' | 'detailed')}
                  >
                    <SelectTrigger className="w-[150px] h-9 text-sm">
                      <SelectValue placeholder="View Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact View</SelectItem>
                      <SelectItem value="detailed">Detailed View</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={exportTrades}
                    className="h-9"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-b border-slate-200">
                    <SortableHeader sortKey="datetime">
                      <span className="font-semibold text-slate-700">Date/Time</span>
                    </SortableHeader>
                    <SortableHeader sortKey="symbol">
                      <span className="font-semibold text-slate-700">Symbol</span>
                    </SortableHeader>
                    <SortableHeader sortKey="side">
                      <span className="font-semibold text-slate-700">Side</span>
                    </SortableHeader>
                    <SortableHeader sortKey="qty">
                      <span className="font-semibold text-slate-700">Qty</span>
                    </SortableHeader>
                    <SortableHeader sortKey="price">
                      <span className="font-semibold text-slate-700">Price</span>
                    </SortableHeader>
                    <SortableHeader sortKey="pnl">
                      <span className="font-semibold text-slate-700">P&L</span>
                    </SortableHeader>
                    
                    {viewMode === 'detailed' && (
                      <>
                        <TableHead className="px-4 py-3.5 font-semibold text-slate-700">Strategy</TableHead>
                        <TableHead className="px-4 py-3.5 font-semibold text-slate-700">Tags</TableHead>
                      </>
                    )}
                    
                    <TableHead className="px-4 py-3.5 font-semibold text-slate-700">
                      {viewMode === 'detailed' ? 'Notes' : 'Strategy & Notes'}
                    </TableHead>
                    
                    {viewMode === 'detailed' && (
                      <TableHead className="px-4 py-3.5 font-semibold text-slate-700">Chart</TableHead>
                    )}
                    
                    <TableHead className="px-4 py-3.5 font-semibold text-slate-700 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAndFilteredTrades.map((trade, index) => {
                    const notesData = extractNotes(trade.notes);
                    const isWin = (trade.pnl || 0) > 0;
                    const isLoss = (trade.pnl || 0) < 0;
                    const isBreakeven = (trade.pnl || 0) === 0;
                    
                    return (
                      <TableRow 
                        key={trade.id}
                        className={`hover:bg-slate-50/80 group ${
                          isWin ? 'border-l-2 border-l-green-500' : 
                          isLoss ? 'border-l-2 border-l-red-500' : 
                          'border-l-2 border-l-slate-300'
                        }`}
                      >
                        <TableCell className="align-top px-4 py-3">
                          <div className="space-y-1">
                            <div className="font-medium text-slate-800">
                              {trade.datetime ? format(new Date(trade.datetime), 'MMM dd, yyyy') : 'N/A'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {trade.datetime ? format(new Date(trade.datetime), 'HH:mm:ss') : ''}
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell className="align-top px-4 py-3">
                          {editingTrade === trade.id ? (
                            <Input
                              value={editFormData.symbol || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, symbol: e.target.value }))}
                              className="w-24 h-8"
                            />
                          ) : (
                            <Badge 
                              variant="outline" 
                              className={`font-mono font-semibold ${
                                isWin ? 'border-green-200 bg-green-50 text-green-800' : 
                                isLoss ? 'border-red-200 bg-red-50 text-red-800' : 
                                'border-slate-200 bg-slate-50 text-slate-700'
                              }`}
                            >
                              {trade.symbol || 'N/A'}
                            </Badge>
                          )}
                        </TableCell>
                        
                        <TableCell className="align-top px-4 py-3">
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
                              className={`${
                                trade.side?.toUpperCase() === 'BUY' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                              }`}
                            >
                              {trade.side?.toUpperCase() || 'N/A'}
                            </Badge>
                          )}
                        </TableCell>
                        
                        <TableCell className="align-top px-4 py-3">
                          {editingTrade === trade.id ? (
                            <Input
                              type="number"
                              value={editFormData.qty || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, qty: Number(e.target.value) }))}
                              className="w-24 h-8"
                            />
                          ) : (
                            <span className="font-medium">{(trade.qty || 0).toLocaleString()}</span>
                          )}
                        </TableCell>
                        
                        <TableCell className="align-top px-4 py-3">
                          {editingTrade === trade.id ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={editFormData.price || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
                              className="w-28 h-8"
                            />
                          ) : (
                            <span className="font-mono">
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency', 
                                currency: 'USD',
                                minimumFractionDigits: 2
                              }).format(trade.price || 0)}
                            </span>
                          )}
                        </TableCell>
                        
                        <TableCell className="align-top px-4 py-3">
                          {editingTrade === trade.id ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={editFormData.pnl || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, pnl: Number(e.target.value) }))}
                              className="w-28 h-8"
                            />
                          ) : (
                            <div className="flex items-center space-x-1">
                              {(trade.pnl || 0) > 0 ? (
                                <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" />
                              ) : (trade.pnl || 0) < 0 ? (
                                <TrendingDown className="w-4 h-4 text-red-600 flex-shrink-0" />
                              ) : (
                                <Minus className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              )}
                              <span className={`font-bold whitespace-nowrap ${
                                (trade.pnl || 0) > 0 ? 'text-green-600' : 
                                (trade.pnl || 0) < 0 ? 'text-red-600' : 
                                'text-slate-500'
                              }`}>
                                {(trade.pnl || 0) > 0 ? '+' : ''}
                                {formatPnL(trade.pnl || 0)}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        
                        {viewMode === 'detailed' && (
                          <>
                            <TableCell className="align-top px-4 py-3">
                              {editingTrade === trade.id ? (
                                <Input
                                  value={editFormData.strategy || ''}
                                  onChange={(e) => setEditFormData(prev => ({ ...prev, strategy: e.target.value }))}
                                  className="w-36 h-8"
                                  placeholder="Strategy"
                                />
                              ) : (
                                <span className="text-sm font-medium text-slate-700">
                                  {(trade as any).strategy || '-'}
                                </span>
                              )}
                            </TableCell>
                            
                            <TableCell className="align-top px-4 py-3 max-w-[150px]">
                              <div className="flex flex-wrap gap-1">
                                {(trade as any).tags?.slice(0, 3).map((tag: string, index: number) => (
                                  <Badge 
                                    key={`${trade.id}-${tag}-${index}`} 
                                    variant="outline" 
                                    className="text-xs font-normal"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                                {((trade as any).tags?.length || 0) > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{((trade as any).tags?.length || 0) - 3}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </>
                        )}
                        
                        <TableCell className="align-top px-4 py-3 max-w-[200px]">
                          {editingTrade === trade.id ? (
                            <Input
                              value={editFormData.notes || ''}
                              onChange={(e) => setEditFormData(prev => ({ ...prev, notes: e.target.value }))}
                              className="w-full h-8"
                              placeholder="Add notes..."
                            />
                          ) : (
                            <div>
                              {viewMode === 'compact' && (trade as any).strategy && (
                                <div className="mb-1">
                                  <Badge variant="secondary" className="font-normal text-xs bg-slate-100">
                                    {(trade as any).strategy}
                                  </Badge>
                                </div>
                              )}
                              
                              {notesData.simple ? (
                                <div className="group/notes relative">
                                  <p className="text-sm text-slate-600 line-clamp-2">
                                    {notesData.simple}
                                  </p>
                                  {notesData.simple.length > 0 && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="absolute -top-1 -right-1 h-6 w-6 p-0 rounded-full opacity-0 group-hover/notes:opacity-100 transition-opacity"
                                      onClick={() => handleViewNotes(trade.id)}
                                    >
                                      <ArrowUpRight className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">No notes</span>
                              )}
                              
                              {viewMode === 'compact' && (trade as any).tags && (trade as any).tags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {(trade as any).tags.slice(0, 2).map((tag: string, index: number) => (
                                    <Badge 
                                      key={`${trade.id}-${tag}-${index}`} 
                                      variant="outline" 
                                      className="text-xs font-normal"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                  {((trade as any).tags?.length || 0) > 2 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{((trade as any).tags?.length || 0) - 2}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        
                        {viewMode === 'detailed' && (
                          <TableCell className="align-top px-4 py-3">
                            {(trade as any).image_url ? (
                              <Button variant="outline" size="sm" asChild className="h-7">
                                <a href={(trade as any).image_url} target="_blank" rel="noopener noreferrer">
                                  <Eye className="w-3 h-3 mr-1" />
                                  View
                                </a>
                              </Button>
                            ) : (
                              <span className="text-slate-400 text-sm">-</span>
                            )}
                          </TableCell>
                        )}
                        
                        <TableCell className="align-top px-4 py-3 text-right">
                          {editingTrade === trade.id ? (
                            <div className="flex space-x-1 justify-end">
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={handleSaveEdit} 
                                disabled={updateTradeMutation.isPending}
                                className="h-8 w-8 p-0"
                              >
                                <Save className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={handleCancelEdit}
                                className="h-8 w-8 p-0"
                              >
                                <X className="h-4 w-4 text-slate-600" />
                              </Button>
                            </div>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 opacity-50 group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Manage Trade</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                
                                <DropdownMenuGroup>
                                  <DropdownMenuItem onClick={() => handleEditTrade(trade)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Trade
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleViewNotes(trade.id)}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    Detailed Analysis
                                    <Badge variant="outline" className="ml-auto">
                                      <ArrowUpRight className="h-3 w-3" />
                                    </Badge>
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                                
                                <DropdownMenuSeparator />
                                
                                <DropdownMenuGroup>
                                  <DropdownMenuItem onClick={() => handleDuplicateTrade(trade.id)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Duplicate Trade
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => setTradeToDelete(trade.id)}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Trade
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {sortedAndFilteredTrades.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={viewMode === 'detailed' ? 11 : 8} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Search className="w-10 h-10 text-slate-300 mb-3" />
                          <h3 className="text-lg font-medium text-slate-600">No trades match your filters</h3>
                          <p className="text-slate-500 mt-1">Try adjusting your search criteria</p>
                          <Button 
                            variant="link" 
                            onClick={resetFilters}
                            className="mt-2"
                          >
                            Reset All Filters
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Symbol Performance */}
            <Card className="border border-slate-200 shadow-sm bg-white">
              <CardHeader className="px-6 py-5">
                <CardTitle className="text-lg flex items-center">
                  <Target className="w-5 h-5 mr-2 text-blue-600" />
                  Symbol Performance
                </CardTitle>
                <CardDescription>
                  Win rates and P&L for each traded instrument
                </CardDescription>
              </CardHeader>
              <div className="overflow-x-auto px-6 pb-6">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="w-[120px]">Symbol</TableHead>
                      <TableHead>Trades</TableHead>
                      <TableHead>Win Rate</TableHead>
                      <TableHead>P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics?.symbolStats && Object.entries(metrics.symbolStats)
                      .sort((a, b) => b[1].pnl - a[1].pnl)
                      .map(([symbol, stats]) => {
                        const winRate = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
                        return (
                          <TableRow key={symbol}>
                            <TableCell>
                              <Badge variant="outline" className="font-mono">
                                {symbol}
                              </Badge>
                            </TableCell>
                            <TableCell>{stats.total}</TableCell>
                            <TableCell>
                              <span className={`font-medium ${
                                winRate >= 50 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {winRate.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`font-medium ${
                                stats.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {stats.pnl >= 0 ? '+' : ''}
                                {formatPnL(stats.pnl)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      
                    {(!metrics?.symbolStats || Object.keys(metrics.symbolStats).length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                          No symbol performance data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Trading Results Breakdown */}
            <Card className="border border-slate-200 shadow-sm bg-white">
              <CardHeader className="px-6 py-5">
                <CardTitle className="text-lg flex items-center">
                  <PieChart className="w-5 h-5 mr-2 text-purple-600" />
                  Trading Results
                </CardTitle>
                <CardDescription>
                  Breakdown of wins, losses, and breakeven trades
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Win/Loss Ratio */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600">Win/Loss Ratio</span>
                      <span className="text-sm font-semibold text-slate-800">
                        {metrics?.winners || 0} W : {metrics?.losers || 0} L
                      </span>
                    </div>
                    <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div className="flex h-full">
                        <div 
                          className="bg-green-500 h-full"
                          style={{ 
                            width: `${metrics?.winRate || 0}%` 
                          }}
                        />
                        <div 
                          className="bg-red-500 h-full"
                          style={{ 
                            width: `${metrics?.lossRate || 0}%` 
                          }}
                        />
                        <div 
                          className="bg-slate-300 h-full"
                          style={{ 
                            width: `${metrics?.breakevenRate || 0}%` 
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-slate-500">
                      <span>Win Rate: {metrics?.winRate.toFixed(1)}%</span>
                      <span>Loss Rate: {metrics?.lossRate.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Average Trade Values */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="border border-green-100 bg-green-50">
                      <CardContent className="p-4">
                        <div className="text-xs font-medium text-green-800 mb-1">Average Win</div>
                        <div className="text-xl font-bold text-green-700">
                          {formatPnL(metrics?.avgWin || 0)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border border-red-100 bg-red-50">
                      <CardContent className="p-4">
                        <div className="text-xs font-medium text-red-800 mb-1">Average Loss</div>
                        <div className="text-xl font-bold text-red-700">
                          {formatPnL(Math.abs(metrics?.avgLoss || 0))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Best and Worst Trades */}
                  <div>
                    <h4 className="text-sm font-medium text-slate-600 mb-2">Best & Worst Trades</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                        <div className="text-xs text-green-800 mb-1">Largest Win</div>
                        <div className="text-lg font-bold text-green-700">
                          {formatPnL(metrics?.largestWin || 0)}
                        </div>
                      </div>
                      <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                        <div className="text-xs text-red-800 mb-1">Largest Loss</div>
                        <div className="text-lg font-bold text-red-700">
                          {formatPnL(Math.abs(metrics?.largestLoss || 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="patterns" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Winning Streaks */}
            <Card className="border border-slate-200 shadow-sm bg-white">
              <CardHeader className="px-6 py-5">
                <CardTitle className="text-lg flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                  Winning Streaks
                </CardTitle>
                <CardDescription>
                  Your longest consecutive winning trades
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="space-y-4">
                  {patterns?.longestWinStreak && patterns.longestWinStreak.length > 1 ? (
                    <>
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <div className="text-sm font-medium text-slate-600">Longest Win Streak</div>
                          <div className="text-2xl font-bold text-green-600">{patterns.longestWinStreak.length} trades</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-600">Total Profit</div>
                          <div className="text-2xl font-bold text-green-600">
                            {formatPnL(patterns.longestWinStreak.amount)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-slate-600">Winning Streak Details</div>
                        {patterns.biggestWinStreak.slice(0, 5).map((trade, index) => (
                          <div 
                            key={trade.id}
                            className="flex justify-between p-2 bg-green-50 border border-green-100 rounded-md"
                          >
                            <div className="text-sm">
                              <span className="font-medium text-green-800">{trade.symbol}</span>
                              <span className="text-slate-500 text-xs ml-2">
                                {trade.datetime ? format(new Date(trade.datetime), 'MMM dd, HH:mm') : 'N/A'}
                              </span>
                            </div>
                            <span className="font-bold text-green-700">+{formatPnL(trade.pnl || 0)}</span>
                          </div>
                        ))}
                        {patterns.biggestWinStreak.length > 5 && (
                          <div className="text-center text-sm text-slate-500">
                            +{patterns.biggestWinStreak.length - 5} more winning trades
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-10">
                      <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">No significant winning streaks found</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Losing Streaks */}
            <Card className="border border-slate-200 shadow-sm bg-white">
              <CardHeader className="px-6 py-5">
                <CardTitle className="text-lg flex items-center">
                  <TrendingDown className="w-5 h-5 mr-2 text-red-600" />
                  Losing Streaks
                </CardTitle>
                <CardDescription>
                  Your longest consecutive losing trades
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="space-y-4">
                  {patterns?.longestLossStreak && patterns.longestLossStreak.length > 1 ? (
                    <>
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <div className="text-sm font-medium text-slate-600">Longest Loss Streak</div>
                          <div className="text-2xl font-bold text-red-600">{patterns.longestLossStreak.length} trades</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-600">Total Loss</div>
                          <div className="text-2xl font-bold text-red-600">
                            {formatPnL(patterns.longestLossStreak.amount)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-slate-600">Losing Streak Details</div>
                        {patterns.biggestLossStreak.slice(0, 5).map((trade, index) => (
                          <div 
                            key={trade.id}
                            className="flex justify-between p-2 bg-red-50 border border-red-100 rounded-md"
                          >
                            <div className="text-sm">
                              <span className="font-medium text-red-800">{trade.symbol}</span>
                              <span className="text-slate-500 text-xs ml-2">
                                {trade.datetime ? format(new Date(trade.datetime), 'MMM dd, HH:mm') : 'N/A'}
                              </span>
                            </div>
                            <span className="font-bold text-red-700">{formatPnL(trade.pnl || 0)}</span>
                          </div>
                        ))}
                        {patterns.biggestLossStreak.length > 5 && (
                          <div className="text-center text-sm text-slate-500">
                            +{patterns.biggestLossStreak.length - 5} more losing trades
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-10">
                      <TrendingDown className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">No significant losing streaks found</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Best Trading Hours */}
            {patterns?.bestHours.length > 0 && (
              <Card className="border border-slate-200 shadow-sm bg-white">
                <CardHeader className="px-6 py-5">
                  <CardTitle className="text-lg flex items-center">
                    <Clock className="w-5 h-5 mr-2 text-green-600" />
                    Best Trading Hours
                  </CardTitle>
                  <CardDescription>
                    Time periods with your most profitable trades
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <div className="space-y-4">
                    {patterns.bestHours.map((hour) => (
                      <div
                        key={hour.hour}
                        className="p-3 border border-green-100 bg-green-50 rounded-lg"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-lg font-bold text-green-800">
                              {hour.hour}:00 - {hour.hour + 1}:00
                            </span>
                            <div className="text-sm text-green-700">
                              {hour.trades} trades ({hour.winners} wins / {hour.losers} losses)
                            </div>
                          </div>
                          <div className="text-xl font-bold text-green-700">
                            {formatPnL(hour.totalPnL)}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {patterns.bestHours.length === 0 && (
                      <div className="text-center py-6">
                        <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">Not enough hourly data</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Worst Trading Hours */}
            {patterns?.worstHours.length > 0 && (
              <Card className="border border-slate-200 shadow-sm bg-white">
                <CardHeader className="px-6 py-5">
                  <CardTitle className="text-lg flex items-center">
                    <Clock className="w-5 h-5 mr-2 text-red-600" />
                    Challenging Trading Hours
                  </CardTitle>
                  <CardDescription>
                    Time periods with your least profitable trades
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <div className="space-y-4">
                    {patterns.worstHours.map((hour) => (
                      <div
                        key={hour.hour}
                        className="p-3 border border-red-100 bg-red-50 rounded-lg"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-lg font-bold text-red-800">
                              {hour.hour}:00 - {hour.hour + 1}:00
                            </span>
                            <div className="text-sm text-red-700">
                              {hour.trades} trades ({hour.winners} wins / {hour.losers} losses)
                            </div>
                          </div>
                          <div className="text-xl font-bold text-red-700">
                            {formatPnL(hour.totalPnL)}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {patterns.worstHours.length === 0 && (
                      <div className="text-center py-6">
                        <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">Not enough hourly data</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Trading Insights */}
          {metrics && (
            <Card className="border border-slate-200 shadow-sm bg-white">
              <CardHeader className="px-6 py-5">
                <CardTitle className="text-lg flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-amber-500" />
                  Trading Insights
                </CardTitle>
                <CardDescription>
                  Key patterns and recommendations based on your trades
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Automated Insights */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800">Automated Analysis</h3>
                    
                    {metrics.winRate >= 55 && (
                      <div className="p-3 border border-green-100 bg-green-50 rounded-lg">
                        <div className="flex">
                          <div className="flex-shrink-0 mr-3">
                            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                              <Trophy className="w-6 h-6 text-green-600" />
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-green-800 mb-1">Strong Win Rate</h4>
                            <p className="text-sm text-green-700">
                              Your {metrics.winRate.toFixed(1)}% win rate shows you have a solid trading edge. 
                              Consider increasing position size to capitalize on your edge.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {metrics.winRate < 50 && (
                      <div className="p-3 border border-amber-100 bg-amber-50 rounded-lg">
                        <div className="flex">
                          <div className="flex-shrink-0 mr-3">
                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                              <AlertTriangle className="w-6 h-6 text-amber-600" />
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-amber-800 mb-1">Win Rate Alert</h4>
                            <p className="text-sm text-amber-700">
                              Your {metrics.winRate.toFixed(1)}% win rate is below 50%. Review your entry criteria 
                              and consider tightening your stop losses.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {patterns?.longestLossStreak && patterns.longestLossStreak.length >= 3 && (
                      <div className="p-3 border border-red-100 bg-red-50 rounded-lg">
                        <div className="flex">
                          <div className="flex-shrink-0 mr-3">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                              <ActivitySquare className="w-6 h-6 text-red-600" />
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-red-800 mb-1">Drawdown Risk</h4>
                            <p className="text-sm text-red-700">
                              You've experienced a {patterns.longestLossStreak.length}-trade losing streak. 
                              Consider reducing position sizes after 2 consecutive losses.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {metrics.bestSymbols && metrics.bestSymbols.length > 0 && metrics.bestSymbols[0].pnl > 0 && (
                      <div className="p-3 border border-blue-100 bg-blue-50 rounded-lg">
                        <div className="flex">
                          <div className="flex-shrink-0 mr-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <Wallet className="w-6 h-6 text-blue-600" />
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-blue-800 mb-1">Symbol Strength</h4>
                            <p className="text-sm text-blue-700">
                              {metrics.bestSymbols[0].symbol} is your most profitable symbol with 
                              {metrics.bestSymbols[0].winRate.toFixed(1)}% win rate. Consider focusing more 
                              on this instrument.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recommendations */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800">Trading Recommendations</h3>
                    
                    <div className="p-4 border border-indigo-100 bg-indigo-50 rounded-lg space-y-4">
                      <h4 className="font-medium text-indigo-800">Suggested Improvements</h4>
                      
                      <div className="space-y-2">
                        {metrics.avgLoss && Math.abs(metrics.avgLoss) > Math.abs(metrics.avgWin) && (
                          <div className="flex items-start">
                            <div className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                              <span className="text-indigo-700 text-xs font-bold">1</span>
                            </div>
                            <p className="text-sm text-indigo-800">
                              Your average loss (${Math.abs(metrics.avgLoss).toFixed(2)}) exceeds your average win (${metrics.avgWin.toFixed(2)}). 
                              Consider tightening stop losses or improving exit criteria.
                            </p>
                          </div>
                        )}
                        
                        {patterns?.bestHours && patterns.bestHours.length > 0 && (
                          <div className="flex items-start">
                            <div className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                              <span className="text-indigo-700 text-xs font-bold">2</span>
                            </div>
                            <p className="text-sm text-indigo-800">
                              You perform best at {patterns.bestHours[0].hour}:00. Consider focusing your trading 
                              during your most profitable hours.
                            </p>
                          </div>
                        )}
                        
                        {metrics.totalPnl < 0 && (
                          <div className="flex items-start">
                            <div className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                              <span className="text-indigo-700 text-xs font-bold">3</span>
                            </div>
                            <p className="text-sm text-indigo-800">
                              Your overall P&L is negative. Consider paper trading or reducing position sizes 
                              until you achieve consistent profitability.
                            </p>
                          </div>
                        )}
                        
                        {patterns?.worstHours && patterns.worstHours.length > 0 && (
                          <div className="flex items-start">
                            <div className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                              <span className="text-indigo-700 text-xs font-bold">4</span>
                            </div>
                            <p className="text-sm text-indigo-800">
                              Avoid trading at {patterns.worstHours[0].hour}:00, where you've lost 
                              {formatPnL(Math.abs(patterns.worstHours[0].totalPnL))} across {patterns.worstHours[0].trades} trades.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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
      
      <a ref={exportRef} style={{ display: 'none' }} />
    </div>
  );
};

// For TypeScript to understand these additional icon components
const Hash = ChevronDown;
const Tags = ChevronDown;
const Minus = ChevronDown;
const Trophy = ChevronDown;
const ActivitySquare = ChevronDown;

export default TradesLogTable;