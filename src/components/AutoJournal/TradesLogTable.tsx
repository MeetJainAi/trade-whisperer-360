import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tables } from '@/integrations/supabase/types';
import { Edit, Filter, SortAsc, SortDesc, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';

interface TradesLogTableProps {
  trades: Tables<'trades'>[];
}

const TradesLogTable = ({ trades }: TradesLogTableProps) => {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<string>('datetime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterSymbol, setFilterSymbol] = useState<string>('');
  const [filterSide, setFilterSide] = useState<string>('all');
  const [filterPnL, setFilterPnL] = useState<string>('all');

  // Get unique symbols for filter
  const uniqueSymbols = Array.from(new Set(trades.map(t => t.symbol).filter(Boolean)));

  // Filter trades
  const filteredTrades = trades.filter(trade => {
    const symbolMatch = !filterSymbol || (trade.symbol?.toLowerCase().includes(filterSymbol.toLowerCase()));
    const sideMatch = filterSide === 'all' || trade.side === filterSide;
    const pnlMatch = filterPnL === 'all' || 
      (filterPnL === 'winners' && (trade.pnl || 0) > 0) ||
      (filterPnL === 'losers' && (trade.pnl || 0) < 0) ||
      (filterPnL === 'breakeven' && (trade.pnl || 0) === 0);
    
    return symbolMatch && sideMatch && pnlMatch;
  });

  // Sort trades
  const sortedTrades = [...filteredTrades].sort((a, b) => {
    let aValue: any = a[sortField as keyof Tables<'trades'>];
    let bValue: any = b[sortField as keyof Tables<'trades'>];
    
    if (sortField === 'datetime') {
      aValue = new Date(aValue || 0).getTime();
      bValue = new Date(bValue || 0).getTime();
    } else if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue?.toLowerCase() || '';
    }
    
    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleTradeClick = (tradeId: string) => {
    navigate(`/trade-notes/${tradeId}`);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-slate-50 rounded-lg border">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-slate-600" />
          <span className="text-sm font-medium text-slate-700">Filters:</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <label className="text-sm text-slate-600">Symbol:</label>
          <Input
            placeholder="Filter by symbol..."
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            className="w-32"
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <label className="text-sm text-slate-600">Side:</label>
          <Select value={filterSide} onValueChange={setFilterSide}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="BUY">BUY</SelectItem>
              <SelectItem value="SELL">SELL</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center space-x-2">
          <label className="text-sm text-slate-600">P&L:</label>
          <Select value={filterPnL} onValueChange={setFilterPnL}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="winners">Winners</SelectItem>
              <SelectItem value="losers">Losers</SelectItem>
              <SelectItem value="breakeven">Breakeven</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center space-x-2 text-sm text-slate-600">
          <span>Showing {sortedTrades.length} of {trades.length} trades</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('datetime')}
              >
                <div className="flex items-center space-x-1">
                  <span>Date & Time</span>
                  <SortIcon field="datetime" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('symbol')}
              >
                <div className="flex items-center space-x-1">
                  <span>Symbol</span>
                  <SortIcon field="symbol" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('side')}
              >
                <div className="flex items-center space-x-1">
                  <span>Side</span>
                  <SortIcon field="side" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 transition-colors text-right"
                onClick={() => handleSort('qty')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Quantity</span>
                  <SortIcon field="qty" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 transition-colors text-right"
                onClick={() => handleSort('price')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Price</span>
                  <SortIcon field="price" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 transition-colors text-right"
                onClick={() => handleSort('pnl')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>P&L</span>
                  <SortIcon field="pnl" />
                </div>
              </TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTrades.map((trade) => (
              <TableRow 
                key={trade.id}
                className="cursor-pointer hover:bg-blue-50 transition-colors"
                onClick={() => handleTradeClick(trade.id)}
              >
                <TableCell className="font-medium">
                  <div>
                    <div className="text-slate-800">
                      {trade.datetime ? format(new Date(trade.datetime), 'MMM dd, yyyy') : 'Unknown Date'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {trade.datetime ? format(new Date(trade.datetime), 'HH:mm:ss') : ''}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono">
                    {trade.symbol || 'N/A'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={trade.side === 'BUY' ? 'default' : 'secondary'}
                    className={trade.side === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                  >
                    {trade.side || 'N/A'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {(trade.qty || 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(trade.price || 0)}
                </TableCell>
                <TableCell className="text-right">
                  <div className={`flex items-center justify-end space-x-1 font-semibold ${
                    (trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {(trade.pnl || 0) >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span className="font-mono">
                      {(trade.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(trade.pnl || 0)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-24 truncate text-sm text-slate-600">
                    {trade.strategy || '-'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-32 truncate text-sm text-slate-600">
                    {trade.notes ? (
                      <div className="flex items-center space-x-1">
                        <FileText className="w-3 h-3" />
                        <span>Has notes</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">No notes</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTradeClick(trade.id);
                    }}
                    className="hover:bg-blue-100"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        {sortedTrades.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p>No trades found matching your filters</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradesLogTable;