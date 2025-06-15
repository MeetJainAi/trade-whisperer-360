
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
import { ListFilter, SortAsc, SortDesc } from "lucide-react";

interface TradesLogTableProps {
  trades: Tables<'trades'>[];
}

type SortableKey = keyof Pick<Tables<'trades'>, 'datetime' | 'symbol' | 'side' | 'qty' | 'price' | 'pnl'>;

const TradesLogTable = ({ trades }: TradesLogTableProps) => {
  const [filters, setFilters] = useState({
    symbol: '',
    side: 'All' as 'All' | 'BUY' | 'SELL',
  });

  const [sortConfig, setSortConfig] = useState<{ key: SortableKey; direction: 'ascending' | 'descending' } | null>({
    key: 'datetime',
    direction: 'descending',
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
            <TableHead>Notes</TableHead>
            <TableHead>Chart</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAndFilteredTrades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell>{format(new Date(trade.datetime), 'PPpp')}</TableCell>
              <TableCell className="font-medium">{trade.symbol}</TableCell>
              <TableCell>
                  <span className={`font-semibold ${trade.side?.toUpperCase() === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.side?.toUpperCase()}
                  </span>
              </TableCell>
              <TableCell>{trade.qty}</TableCell>
              <TableCell>${trade.price?.toFixed(2)}</TableCell>
              <TableCell className={`font-medium ${trade.pnl && trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {trade.pnl && trade.pnl >= 0 ? '+' : ''}{trade.pnl?.toFixed(2)}
              </TableCell>
              <TableCell>{(trade as any).strategy}</TableCell>
              <TableCell className="max-w-[200px]">
                {(trade as any).tags?.map((tag: string, index: number) => (
                  <Badge key={`${trade.id}-${tag}-${index}`} variant="outline" className="mr-1 mb-1 font-normal">{tag}</Badge>
                ))}
              </TableCell>
              <TableCell className="text-slate-600 max-w-[250px] truncate">{trade.notes}</TableCell>
              <TableCell>
                  {(trade as any).image_url && (
                      <a href={(trade as any).image_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          View
                      </a>
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
