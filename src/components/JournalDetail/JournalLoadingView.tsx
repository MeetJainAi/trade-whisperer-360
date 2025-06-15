
import { Loader2 } from 'lucide-react';

const JournalLoadingView = () => {
  console.log('Still loading...');
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p>Loading journal...</p>
      </div>
    </div>
  );
};

export default JournalLoadingView;
