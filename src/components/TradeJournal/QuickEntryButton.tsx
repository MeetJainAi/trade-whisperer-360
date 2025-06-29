import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger
} from '@/components/ui/dialog';
import TradeEntryForm from './TradeEntryForm';

interface QuickEntryButtonProps {
  journalId: string;
  onTradeAdded?: () => void;
}

const QuickEntryButton = ({ journalId, onTradeAdded = () => {} }: QuickEntryButtonProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleTradeAdded = () => {
    setIsDialogOpen(false);
    onTradeAdded();
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 shadow-md"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Trade Manually
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Add Trade Manually</DialogTitle>
          <DialogDescription>
            Enter the details of your trade below. Required fields are marked with an asterisk (*).
          </DialogDescription>
        </DialogHeader>
        <TradeEntryForm 
          journalId={journalId} 
          onTradeAdded={handleTradeAdded}
          onCancel={() => setIsDialogOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};

export default QuickEntryButton;