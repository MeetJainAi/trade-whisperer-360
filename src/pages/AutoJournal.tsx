import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Upload, ArrowLeft, TrendingUp, TrendingDown, DollarSign, Percent, Clock, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import Papa from 'papaparse';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import ColumnMapping from '@/components/ColumnMapping';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };

const calculateMetrics = (trades: any[]) => {
    const total_trades = trades.length;
    if (total_trades === 0) {
        return {
            total_pnl: 0,
            total_trades: 0,
            win_rate: 0,
            avg_win: 0,
            avg_loss: 0,
            max_drawdown: 0,
            equity_curve: [],
            time_data: [],
        };
    }

    let total_pnl = 0;
    const winning_trades_pnl: number[] = [];
    const losing_trades_pnl: number[] = [];
    const equity_curve_data = [];
    let cumulative_pnl = 0;
    let peak_equity = 0;
    let max_drawdown = 0;

    const trades_by_time: { [key: string]: { time: string; trades: number; pnl: number } } = {};

    trades.sort((a: any, b: any) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()).forEach((trade: any, index: number) => {
        const pnl = parseFloat(trade.pnl) || 0;
        total_pnl += pnl;
        cumulative_pnl += pnl;

        if (pnl > 0) {
            winning_trades_pnl.push(pnl);
        } else if (pnl < 0) {
            losing_trades_pnl.push(pnl);
        }

        equity_curve_data.push({ trade: index + 1, cumulative: cumulative_pnl });

        if (cumulative_pnl > peak_equity) {
            peak_equity = cumulative_pnl;
        }
        const drawdown = peak_equity - cumulative_pnl;
        if (drawdown > max_drawdown) {
            max_drawdown = drawdown;
        }

        const date = new Date(trade.datetime);
        const time_key = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        if (!trades_by_time[time_key]) {
            trades_by_time[time_key] = { time: time_key, trades: 0, pnl: 0 };
        }
        trades_by_time[time_key].trades += 1;
        trades_by_time[time_key].pnl += pnl;
    });

    const win_rate = total_trades > 0 ? (winning_trades_pnl.length / total_trades) * 100 : 0;
    const avg_win = winning_trades_pnl.length > 0 ? winning_trades_pnl.reduce((a, b) => a + b, 0) / winning_trades_pnl.length : 0;
    const avg_loss = losing_trades_pnl.length > 0 ? losing_trades_pnl.reduce((a, b) => a + b, 0) / losing_trades_pnl.length : 0;

    const time_data = Object.values(trades_by_time).sort((a,b) => a.time.localeCompare(b.time));

    return {
        total_pnl,
        total_trades,
        win_rate,
        avg_win,
        avg_loss,
        max_drawdown,
        equity_curve: equity_curve_data,
        time_data,
    };
}

const AutoJournal = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState<TradeSessionWithTrades | null>(null);
  const [uploadStep, setUploadStep] = useState<'upload' | 'map'>('upload');
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [initialMapping, setInitialMapping] = useState<{ [key: string]: string }>({});
  const [isMappingLoading, setIsMappingLoading] = useState(false);

  const createSessionMutation = useMutation({
    mutationFn: async (trades: any[]) => {
      if (!user) throw new Error("You must be logged in to create a session.");
      if (trades.length === 0) throw new Error("No trades found in the file.");

      const metrics = calculateMetrics(trades);

      const { data: insights, error: insightsError } = await supabase.functions.invoke('analyze-trades', {
        body: { trades },
      });
      if (insightsError) throw new Error(`Failed to get AI insights: ${insightsError.message}`);

      const sessionData: Omit<TablesInsert<'trade_sessions'>, 'user_id'> & { user_id: string } = {
        user_id: user.id,
        total_pnl: metrics.total_pnl,
        total_trades: metrics.total_trades,
        win_rate: metrics.win_rate,
        avg_win: metrics.avg_win,
        avg_loss: metrics.avg_loss,
        max_drawdown: metrics.max_drawdown,
        equity_curve: metrics.equity_curve as any,
        time_data: metrics.time_data as any,
        ai_strengths: insights.ai_strengths,
        ai_mistakes: insights.ai_mistakes,
        ai_fixes: insights.ai_fixes,
        ai_key_insight: insights.ai_key_insight,
      };

      const { data: newSession, error: sessionError } = await supabase
        .from('trade_sessions')
        .insert(sessionData)
        .select()
        .single();
      
      if (sessionError) throw sessionError;

      const tradesData = trades.map(trade => ({
        ...trade,
        session_id: newSession.id,
        user_id: user.id,
        datetime: new Date(trade.datetime).toISOString(),
      }));

      const { error: tradesError } = await supabase.from('trades').insert(tradesData);
      if (tradesError) throw tradesError;
      
      return { ...newSession, trades: tradesData } as TradeSessionWithTrades;
    },
    onSuccess: (data) => {
      setCurrentSession(data);
      setUploadStep('upload');
      setCsvData([]);
      setCsvHeaders([]);
      toast({ title: "Success!", description: "Your trade session has been analyzed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const mapColumnsMutation = useMutation({
    mutationFn: async ({ csvHeaders, csvDataSample }: { csvHeaders: string[]; csvDataSample: any[] }) => {
      const { data, error } = await supabase.functions.invoke('map-columns-with-gemini', {
        body: { csvHeaders, csvDataSample },
      });

      if (error) {
        throw new Error(`Failed to get mapping from AI: ${error.message}`);
      }
      return data.mapping;
    },
    onSuccess: (mapping) => {
      setInitialMapping(mapping);
      setUploadStep('map');
    },
    onError: (error: any) => {
      toast({
        title: "AI Mapping Failed",
        description: `${error.message}. We'll proceed with basic mapping. You can correct it manually.`,
        variant: "destructive"
      });
      // Fallback to basic mapping if AI fails
      setInitialMapping({});
      setUploadStep('map');
    },
    onSettled: () => {
      setIsMappingLoading(false);
    }
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsMappingLoading(true);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.meta.fields || results.meta.fields.length === 0) {
            toast({ title: "Invalid CSV", description: "Could not read headers from the file.", variant: "destructive" });
            setIsMappingLoading(false);
            return;
          }
          if (results.data.length === 0) {
            toast({ title: "Empty File", description: "No trade data found in the CSV.", variant: "destructive" });
            setIsMappingLoading(false);
            return;
          }
          const headers = results.meta.fields;
          const data = results.data as any[];
          setCsvData(data);
          setCsvHeaders(headers);
          
          const sampleData = data.slice(0, 3);
          mapColumnsMutation.mutate({ csvHeaders: headers, csvDataSample: sampleData });
        },
        error: (error: any) => {
            toast({ title: "CSV Parsing Error", description: error.message, variant: "destructive" });
            setIsMappingLoading(false);
        }
      });
    }
  };

  const handleMapComplete = (mappedData: any[]) => {
      createSessionMutation.mutate(mappedData);
  }

  const handleCancelMapping = () => {
      setUploadStep('upload');
      setCsvData([]);
      setCsvHeaders([]);
  }
  
  const handleUseSampleData = () => {
    const sampleTrades = [
        { datetime: '2024-01-15 09:30:00', symbol: 'AAPL', side: 'BUY', qty: 100, price: 150.25, pnl: 45.00, notes: 'Breakout' },
        { datetime: '2024-01-15 09:45:00', symbol: 'AAPL', side: 'SELL', qty: 100, price: 150.70, pnl: 45.00, notes: 'Took profit' },
        { datetime: '2024-01-15 10:15:00', symbol: 'TSLA', side: 'SELL', qty: 50, price: 245.80, pnl: -30.00, notes: 'Stop loss hit' },
        { datetime: '2024-01-15 10:30:00', symbol: 'GOOG', side: 'BUY', qty: 20, price: 140.00, pnl: 55.00, notes: '' },
        { datetime: '2024-01-15 11:00:00', symbol: 'GOOG', side: 'SELL', qty: 20, price: 142.75, pnl: 55.00, notes: '' },
        { datetime: '2024-01-15 11:30:00', symbol: 'MSFT', side: 'BUY', qty: 50, price: 390.00, pnl: -35.00, notes: 'Faked out' },
    ];
    createSessionMutation.mutate(sampleTrades);
  };

  if (!currentSession) {
    if (uploadStep === 'map') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
          <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Button variant="ghost" onClick={handleCancelMapping}>
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
          <ColumnMapping
            csvHeaders={csvHeaders}
            csvData={csvData}
            onMapComplete={handleMapComplete}
            onCancel={handleCancelMapping}
            isProcessing={createSessionMutation.isPending}
            initialMapping={initialMapping}
          />
        </div>
      );
    }

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
                <Upload className="w-10 h-10 text-green-600" />
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
                  disabled={createSessionMutation.isPending || isMappingLoading}
                />
                <label htmlFor="file-upload" className={`cursor-pointer ${createSessionMutation.isPending || isMappingLoading ? 'opacity-50' : ''}`}>
                  {isMappingLoading ? (
                    <Loader2 className="w-12 h-12 text-slate-400 mx-auto mb-4 animate-spin" />
                  ) : createSessionMutation.isPending ? (
                    <Loader2 className="w-12 h-12 text-slate-400 mx-auto mb-4 animate-spin" />
                  ) : (
                    <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  )}
                  <p className="text-lg font-medium text-slate-700 mb-2">
                    {isMappingLoading ? 'Analyzing columns with AI...' : createSessionMutation.isPending ? 'Processing...' : 'Choose CSV file'}
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
                  disabled={createSessionMutation.isPending || isMappingLoading}
                >
                  {createSessionMutation.isPending || isMappingLoading ? 'Processing...' : 'Use Sample Data for Demo'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
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
                <h1 className="text-2xl font-bold text-slate-800">Trade Analysis</h1>
                <p className="text-sm text-slate-600">{currentSession.total_trades} trades processed • {new Date(currentSession.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setCurrentSession(null)}
              className="border-slate-300"
            >
              Upload New File
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Performance Summary */}
        <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total P&L</p>
                  <p className={`text-2xl font-bold ${currentSession.total_pnl && currentSession.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${currentSession.total_pnl && currentSession.total_pnl >= 0 ? '+' : ''}{currentSession.total_pnl?.toFixed(2)}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  currentSession.total_pnl && currentSession.total_pnl >= 0 ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {currentSession.total_pnl && currentSession.total_pnl >= 0 ? (
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Win Rate</p>
                  <p className="text-2xl font-bold text-slate-800">{currentSession.win_rate?.toFixed(2)}%</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Percent className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Trades</p>
                  <p className="text-2xl font-bold text-slate-800">{currentSession.total_trades}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Max Drawdown</p>
                  <p className="text-2xl font-bold text-red-600">-${currentSession.max_drawdown?.toFixed(2)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <span>Trades by Time</span>
              </CardTitle>
              <CardDescription>Your trading activity throughout the day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={currentSession.time_data as any[]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="trades" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span>Equity Curve</span>
              </CardTitle>
              <CardDescription>Your cumulative P&L progression</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={currentSession.equity_curve as any[]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="trade" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="cumulative" stroke="#10b981" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* AI Insights */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>AI-Generated Insights</CardTitle>
            <CardDescription>Personalized analysis of your trading patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold text-green-900 mb-3 flex items-center">
                  <div className="w-3 h-3 rounded-full bg-green-500 mr-2" />
                  Top Strengths
                </h4>
                <ul className="space-y-2 text-sm text-green-800">
                  {currentSession.ai_strengths?.map((item, i) => <li key={i}>• {item}</li>)}
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-red-900 mb-3 flex items-center">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-2" />
                  Repeating Mistakes
                </h4>
                <ul className="space-y-2 text-sm text-red-800">
                  {currentSession.ai_mistakes?.map((item, i) => <li key={i}>• {item}</li>)}
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-2" />
                  3 Fixes for Tomorrow
                </h4>
                <ul className="space-y-2 text-sm text-blue-800">
                  {currentSession.ai_fixes?.map((item, i) => <li key={i}>• {item}</li>)}
                </ul>
              </div>
            </div>

            <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-slate-800 mb-2">Key Insight</h4>
              <p className="text-slate-700">
                {currentSession.ai_key_insight}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AutoJournal;
