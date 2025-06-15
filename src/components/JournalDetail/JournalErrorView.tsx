
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface JournalErrorViewProps {
  error?: Error | null;
  notFound?: boolean;
}

const JournalErrorView = ({ error, notFound }: JournalErrorViewProps) => {
  const navigate = useNavigate();

  console.log('Error occurred:', error);

  if (notFound) {
    console.log('No journal found');
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p>Journal not found</p>
          <Button onClick={() => navigate('/journals')} className="mt-4">
            Back to Journals
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <p className="text-red-600">Error loading journal</p>
        <Button onClick={() => navigate('/journals')} className="mt-4">
          Back to Journals
        </Button>
      </div>
    </div>
  );
};

export default JournalErrorView;
