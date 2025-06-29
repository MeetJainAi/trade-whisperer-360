import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { Tables } from '@/integrations/supabase/types';
import { CalendarIcon, CheckCircle, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface TradeEntryFormProps {
  journalId: string;
  onTradeAdded: () => void;
  onCancel: () => void;
}

const TradeEntryForm = ({ journalId, onTradeAdded, onCancel }: TradeEntryFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [tradeDate, setTradeDate] = useState<Date>(new Date());
  const [tradeTime, setTradeTime] = useState(format(new Date(), 'HH:mm'));
  
  const [formData, setFormData] = useState({
    symbol: '',
    side: 'BUY',
    qty: '',
    price: '',
    pnl: '',
    notes: '',
    strategy: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Error", description: "You must be logged in to add trades", variant: "destructive" });
      return;
    }

    // Validate required fields
    if (!formData.symbol || !formData.qty || !formData.price || !formData.pnl) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Combine date and time
      const dateTime = new Date(tradeDate);
      const [hours, minutes] = tradeTime.split(':').map(Number);
      dateTime.setHours(hours, minutes, 0, 0);

      // Check if we need to create a new session
      const { data: sessions, error: sessionError } = await supabase
        .from('trade_sessions')
        .select('id')
        .eq('journal_id', journalId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (sessionError) throw sessionError;

      let sessionId: string;
      
      if (sessions && sessions.length > 0) {
        // Use the most recent session
        sessionId = sessions[0].id;
      } else {
        // Create a new session
        const { data: newSession, error: newSessionError } = await supabase
          .from('trade_sessions')
          .insert({
            journal_id: journalId,
            user_id: user.id,
            total_trades: 1,
            total_pnl: parseFloat(formData.pnl),
            win_rate: parseFloat(formData.pnl) > 0 ? 100 : 0,
          })
          .select()
          .single();

        if (newSessionError) throw newSessionError;
        sessionId = newSession.id;
      }

      // Create the trade
      const newTrade: Partial<Tables<'trades'>> = {
        session_id: sessionId,
        journal_id: journalId,
        user_id: user.id,
        datetime: dateTime.toISOString(),
        symbol: formData.symbol.toUpperCase().trim(),
        side: formData.side,
        qty: parseFloat(formData.qty),
        price: parseFloat(formData.price),
        pnl: parseFloat(formData.pnl),
        notes: formData.notes || null,
        strategy: formData.strategy || null,
      };

      const { error: tradeError } = await supabase
        .from('trades')
        .insert(newTrade);

      if (tradeError) throw tradeError;

      // Update session metrics
      const { data: sessionTrades, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .eq('session_id', sessionId);

      if (!tradesError && sessionTrades) {
        const totalTrades = sessionTrades.length;
        const totalPnl = sessionTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
        const winningTrades = sessionTrades.filter(t => (t.pnl || 0) > 0).length;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

        await supabase
          .from('trade_sessions')
          .update({
            total_trades: totalTrades,
            total_pnl: totalPnl,
            win_rate: winRate,
          })
          .eq('id', sessionId);
      }

      toast({ 
        title: "Success", 
        description: "Trade added successfully"
      });

      // Reset form
      setFormData({
        symbol: '',
        side: 'BUY',
        qty: '',
        price: '',
        pnl: '',
        notes: '',
        strategy: '',
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['journalWithSessions', journalId] });
      onTradeAdded();
    } catch (error: any) {
      console.error('Error adding trade:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to add trade", 
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border shadow-lg">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-green-50 border-b">
        <CardTitle className="flex items-center text-lg">
          <Plus className="w-5 h-5 mr-2 text-green-600" />
          Manual Trade Entry
        </CardTitle>
      </CardHeader>
      
      <form onSubmit={handleSubmit}>
        <CardContent className="pt-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Symbol */}
              <div className="space-y-2">
                <Label htmlFor="symbol" className="text-sm font-medium">
                  Symbol<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="symbol"
                  name="symbol"
                  placeholder="e.g. AAPL, ES, NQ"
                  value={formData.symbol}
                  onChange={handleInputChange}
                  required
                  className="uppercase"
                />
              </div>
              
              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Date<span className="text-red-500">*</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !tradeDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {tradeDate ? format(tradeDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={tradeDate}
                        onSelect={(date) => date && setTradeDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time" className="text-sm font-medium">
                    Time<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={tradeTime}
                    onChange={(e) => setTradeTime(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              {/* Side */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Side<span className="text-red-500">*</span>
                </Label>
                <RadioGroup 
                  value={formData.side} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, side: value }))}
                  className="flex space-x-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="BUY" id="buy" />
                    <Label htmlFor="buy" className="text-green-700">BUY</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="SELL" id="sell" />
                    <Label htmlFor="sell" className="text-red-700">SELL</Label>
                  </div>
                </RadioGroup>
              </div>
              
              {/* Strategy */}
              <div className="space-y-2">
                <Label htmlFor="strategy" className="text-sm font-medium">
                  Strategy
                </Label>
                <Input
                  id="strategy"
                  name="strategy"
                  placeholder="e.g. Breakout, Scalping"
                  value={formData.strategy}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            {/* Right Column */}
            <div className="space-y-4">
              {/* Quantity */}
              <div className="space-y-2">
                <Label htmlFor="qty" className="text-sm font-medium">
                  Quantity<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="qty"
                  name="qty"
                  type="number"
                  step="any"
                  placeholder="Number of shares/contracts"
                  value={formData.qty}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              {/* Price */}
              <div className="space-y-2">
                <Label htmlFor="price" className="text-sm font-medium">
                  Price<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  step="0.01"
                  placeholder="Execution price"
                  value={formData.price}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              {/* P&L */}
              <div className="space-y-2">
                <Label htmlFor="pnl" className="text-sm font-medium">
                  P&L<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="pnl"
                  name="pnl"
                  type="number"
                  step="0.01"
                  placeholder="Profit/Loss amount (negative for losses)"
                  value={formData.pnl}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-medium">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Add any notes about this trade"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={3}
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t bg-slate-50 py-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            type="submit"
            disabled={isSubmitting}
            className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
          >
            {isSubmitting ? 'Adding...' : 'Add Trade'}
            {!isSubmitting && <CheckCircle className="ml-2 h-4 w-4" />}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default TradeEntryForm;