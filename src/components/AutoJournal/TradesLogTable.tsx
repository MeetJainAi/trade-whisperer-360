
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

interface TradesLogTableProps {
  trades: Tables<'trades'>[];
}

const TradesLogTable = ({ trades }: TradesLogTableProps) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date/Time</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>P&L</TableHead>
          <TableHead>Strategy</TableHead>
          <TableHead>Tags</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead>Chart</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((trade) => (
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
              {(trade as any).tags?.map((tag: string) => (
                <Badge key={tag} variant="outline" className="mr-1 mb-1 font-normal">{tag}</Badge>
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
  );
};

export default TradesLogTable;
