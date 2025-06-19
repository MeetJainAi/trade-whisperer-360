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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ListFilter, SortAsc, SortDesc, Edit, FileText, MoreHorizontal, Save, X } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface TradesLogTableProps {
  trades: Tables<'trades'>[];
}

type SortableKey = keyof Pick<Tables<'trades'>, 'datetime' | 'symbol' | 'side' | 'qty' | 'price' | 'pnl'>;

const TradesLogTable = ({ trades }: TradesLogTableProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    symbol: '',
    side: 'All' as 'All' | 'BUY' | 'SELL',
  });

  const [sortConfig, setSortConfig] = useState<{ key: SortableKey; direction: 'ascending' | 'descending' } | null>({
    key: 'datetime',
    direction: 'descending',
  });

  const [editingTrade, setEditingTrade] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Tables<'trades'>>>({});

  const updateTradeMutation = useMutation({
    mutationFn: async ({ tradeId, updates }: { tradeId: string; updates: Partial<Tables<'trades'>> }) => {
      const { data, error } = await supabase
        .from('trades')
        .update(updates)
        .eq('id', tradeId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalWithSessions'] });
      toast({ title: "Success", description: "Trade updated successfully." });
      setEditingTrade(null);
      setEditFormData({});
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

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
      symbol: trade.symbol,
      side: trade.side,
      qty: trade.qty,
      price: trade.price,
      pnl: trade.pnl,
      notes: trade.notes,
      strategy: (trade as any).strategy,
      tags: (trade as any).tags,
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

  const sortedAndFilteredTrades = useMemo(() => {
    let filteredTrades = [...trades];

    if (filters.symbol) {
      filteredTrades = filteredTrades.filter(trade =>
        trade.symbol?.toLowerCase().includes(filters.symbol.toLowerCase())
      );
    }
    if (filters.side !== 'All') {
      filteredTrades = filteredTrades.filter(trade => trade.side?.toUpperCase() === filters.side);
    }

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

  const getSortIcon = (key: SortableKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'ascending' ? <SortAsc className="w-4 h-4 ml-2" /> : <SortDesc className="w-4 h-4 ml-2" />;
  };

  const SortableHeader = ({ sortKey, children }: { sortKey: SortableKey; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => requestSort(sortKey)}>
      <div className="flex items-center">
        {children}
        {getSortIcon(sortKey)}
      </div>
    </TableHead>
  );

  return (
    <div>
      <div className="flex items-center space-x-2 md:space-x-4 mb-4">
        <Input
          placeholder="Filter by Symbol..."
          value={filters.symbol}
          onChange={(e) => handleFilterChange('symbol', e.target.value)}
          className="max-w-xs h-9"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9">
              <ListFilter className="w-4 h-4 mr-2" />
              Side: {filters.side}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => handleFilterChange('side', 'All')}>All</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleFilterChange('side', 'BUY')}>Buy</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleFilterChange('side', 'SELL')}>Sell</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader sortKey="datetime">Date/Time</SortableHeader>
            <SortableHeader sortKey="symbol">Symbol</SortableHeader>
            <SortableHeader sortKey="side">Side</SortableHeader>
            <SortableHeader sortKey="qty">Qty</SortableHeader>
            <SortableHeader sortKey="price">Price</SortableHeader>
            <SortableHeader sortKey="pnl">P&L</SortableHeader>
            <TableHead>Strategy</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Quick Notes</TableHead>
            <TableHead>Chart</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAndFilteredTrades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell>{format(new Date(trade.datetime), 'PPpp')}</TableCell>
              
              {/* Symbol - Editable */}
              <TableCell className="font-medium">
                {editingTrade === trade.id ? (
                  <Input
                    value={editFormData.symbol || ''}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, symbol: e.target.value }))}
                    className="w-20 h-8"
                  />
                ) : (
                  trade.symbol
                )}
              </TableCell>
              
              {/* Side - Editable */}
              <TableCell>
                {editingTrade === trade.id ? (
                  <select
                    value={editFormData.side || ''}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, side: e.target.value as 'BUY' | 'SELL' }))}
                    className="w-20 h-8 border rounded px-2"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                ) : (
                  <span className={`font-semibold ${trade.side?.toUpperCase() === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                    {trade.side?.toUpperCase()}
                  </span>
                )}
              </TableCell>
              
              {/* Quantity - Editable */}
              <TableCell>
                {editingTrade === trade.id ? (
                  <Input
                    type="number"
                    value={editFormData.qty || ''}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, qty: Number(e.target.value) }))}
                    className="w-20 h-8"
                  />
                ) : (
                  trade.qty
                )}
              </TableCell>
              
              {/* Price - Editable */}
              <TableCell>
                {editingTrade === trade.id ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={editFormData.price || ''}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
                    className="w-24 h-8"
                  />
                ) : (
                  `$${trade.price?.toFixed(2)}`
                )}
              </TableCell>
              
              {/* P&L - Editable */}
              <TableCell>
                {editingTrade === trade.id ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={editFormData.pnl || ''}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, pnl: Number(e.target.value) }))}
                    className="w-24 h-8"
                  />
                ) : (
                  <span className={`font-medium ${trade.pnl && trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {trade.pnl && trade.pnl >= 0 ? '+' : ''}{trade.pnl?.toFixed(2)}
                  </span>
                )}
              </TableCell>
              
              {/* Strategy - Editable */}
              <TableCell>
                {editingTrade === trade.id ? (
                  <Input
                    value={editFormData.strategy || ''}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, strategy: e.target.value }))}
                    className="w-24 h-8"
                    placeholder="Strategy"
                  />
                ) : (
                  (trade as any).strategy
                )}
              </TableCell>
              
              {/* Tags */}
              <TableCell className="max-w-[200px]">
                {(trade as any).tags?.map((tag: string, index: number) => (
                  <Badge key={`${trade.id}-${tag}-${index}`} variant="outline" className="mr-1 mb-1 font-normal">{tag}</Badge>
                ))}
              </TableCell>
              
              {/* Quick Notes - Editable */}
              <TableCell className="max-w-[250px]">
                {editingTrade === trade.id ? (
                  <Input
                    value={editFormData.notes || ''}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-32 h-8"
                    placeholder="Quick notes..."
                  />
                ) : (
                  <span className="text-slate-600 truncate">
                    {trade.notes || '-'}
                  </span>
                )}
              </TableCell>
              
              {/* Chart */}
              <TableCell>
                {(trade as any).image_url && (
                  <a href={(trade as any).image_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                    View
                  </a>
                )}
              </TableCell>
              
              {/* Actions */}
              <TableCell>
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
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditTrade(trade)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Trade
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleViewNotes(trade.id)}>
                        <FileText className="h-4 w-4 mr-2" />
                        Detailed Notes
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
  );
};

export default TradesLogTable;