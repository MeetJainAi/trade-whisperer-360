
import { Button } from '@/components/ui/button';

interface SampleDataButtonProps {
  onClick: () => void;
  loadingMessage: string;
}

const SampleDataButton = ({ onClick, loadingMessage }: SampleDataButtonProps) => (
  <div className="mt-6 text-center">
    <Button
      onClick={onClick}
      className="bg-blue-600 text-white hover:bg-blue-700"
      disabled={!!loadingMessage}
    >
      {loadingMessage ? 'Processing...' : 'Use Sample Data for Demo'}
    </Button>
  </div>
);

export default SampleDataButton;
