
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, ArrowLeft, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UploadViewProps {
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleUseSampleData: () => void;
  isLoading: boolean;
  statusText: string;
}

const UploadView = ({ handleFileUpload, handleUseSampleData, isLoading, statusText }: UploadViewProps) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Auto-Journal</h1>
                <p className="text-sm text-slate-600">Upload and analyze your trades</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-green-100 to-blue-100 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-12 h-12 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Upload Your Trade Data</CardTitle>
            <CardDescription className="max-w-2xl mx-auto">
              Drag and drop your CSV file with trade data or click to browse. We'll analyze your performance and provide AI-powered insights.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={isLoading}
              />
              <label htmlFor="file-upload" className={`cursor-pointer ${isLoading ? 'opacity-50' : ''}`}>
                {isLoading ? (
                  <Loader2 className="w-12 h-12 text-slate-400 mx-auto mb-4 animate-spin" />
                ) : (
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                )}
                <p className="text-lg font-medium text-slate-700 mb-2">
                  {statusText}
                </p>
                <p className="text-sm text-slate-500">
                  We'll help you map columns like date, symbol, P&L, etc.
                </p>
              </label>
            </div>

            <div className="mt-8">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Example CSV Format:</h3>
              <div className="bg-slate-50 rounded-lg p-4 text-sm font-mono">
                <div className="text-slate-600 mb-2">datetime,symbol,side,qty,price,pnl,notes</div>
                <div className="text-slate-800">2024-01-15 09:30:00,AAPL,BUY,100,150.25,245.50,Good breakout</div>
                <div className="text-slate-800">2024-01-15 10:15:00,TSLA,SELL,50,245.80,-125.00,Stop loss hit</div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Button
                onClick={handleUseSampleData}
                variant="outline"
                className="border-blue-300 text-blue-600 hover:bg-blue-50"
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : 'Use Sample Data for Demo'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UploadView;
