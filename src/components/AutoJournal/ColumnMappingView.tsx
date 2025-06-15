
import { Button } from '@/components/ui/button';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import ColumnMapping from '@/components/ColumnMapping';

interface ColumnMappingViewProps {
  csvHeaders: string[];
  csvData: any[];
  onMapComplete: (mappedData: any[]) => void;
  onCancel: () => void;
  isProcessing: boolean;
  initialMapping: { [key: string]: string };
}

const ColumnMappingView = ({ onCancel, ...props }: ColumnMappingViewProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button variant="ghost" onClick={onCancel}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Upload
              </Button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Auto-Journal</h1>
                <p className="text-sm text-slate-600">Map your columns</p>
              </div>
            </div>
          </div>
        </div>
      </header>
      <ColumnMapping {...props} onCancel={onCancel} />
    </div>
  );
};

export default ColumnMappingView;
