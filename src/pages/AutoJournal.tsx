
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Upload, ArrowLeft, TrendingUp, TrendingDown, DollarSign, Percent, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const AutoJournal = () => {
  const navigate = useNavigate();
  const [hasData, setHasData] = useState(false);

  // Sample trade data for demo
  const sampleData = {
    totalPnL: 245.75,
    totalTrades: 12,
    winRate: 67,
    avgWin: 95.50,
    avgLoss: -45.25,
    maxDrawdown: 120.00,
    timeData: [
      { time: '9:30', trades: 3, pnl: 85 },
      { time: '10:00', trades: 2, pnl: -25 },
      { time: '10:30', trades: 1, pnl: 45 },
      { time: '11:00', trades: 2, pnl: 65 },
      { time: '11:30', trades: 1, pnl: -35 },
      { time: '12:00', trades: 0, pnl: 0 },
      { time: '1:00', trades: 1, pnl: 55 },
      { time: '2:00', trades: 2, pnl: 55.75 }
    ],
    equityCurve: [
      { trade: 1, cumulative: 45 },
      { trade: 2, cumulative: 90 },
      { trade: 3, cumulative: 125 },
      { trade: 4, cumulative: 95 },
      { trade: 5, cumulative: 140 },
      { trade: 6, cumulative: 105 },
      { trade: 7, cumulative: 160 },
      { trade: 8, cumulative: 125 },
      { trade: 9, cumulative: 180 },
      { trade: 10, cumulative: 205 },
      { trade: 11, cumulative: 225 },
      { trade: 12, cumulative: 245.75 }
    ]
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      // Simulate file processing
      setTimeout(() => {
        setHasData(true);
      }, 1500);
    }
  };

  if (!hasData) {
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
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-slate-700 mb-2">Choose CSV file</p>
                  <p className="text-sm text-slate-500">
                    File should contain: datetime, symbol, side, qty, price, pnl, notes
                  </p>
                </label>
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Expected CSV Format:</h3>
                <div className="bg-slate-50 rounded-lg p-4 text-sm font-mono">
                  <div className="text-slate-600 mb-2">datetime,symbol,side,qty,price,pnl,notes</div>
                  <div className="text-slate-800">2024-01-15 09:30:00,AAPL,BUY,100,150.25,245.50,Good breakout</div>
                  <div className="text-slate-800">2024-01-15 10:15:00,TSLA,SELL,50,245.80,-125.00,Stop loss hit</div>
                </div>
              </div>

              <div className="mt-6 text-center">
                <Button 
                  onClick={() => setHasData(true)}
                  variant="outline"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50"
                >
                  Use Sample Data for Demo
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
                <p className="text-sm text-slate-600">12 trades processed • Today's session</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setHasData(false)}
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
                  <p className={`text-2xl font-bold ${sampleData.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${sampleData.totalPnL >= 0 ? '+' : ''}{sampleData.totalPnL}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  sampleData.totalPnL >= 0 ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {sampleData.totalPnL >= 0 ? (
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
                  <p className="text-2xl font-bold text-slate-800">{sampleData.winRate}%</p>
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
                  <p className="text-2xl font-bold text-slate-800">{sampleData.totalTrades}</p>
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
                  <p className="text-2xl font-bold text-red-600">-${sampleData.maxDrawdown}</p>
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
                <BarChart data={sampleData.timeData}>
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
                <LineChart data={sampleData.equityCurve}>
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
                  <li>• Excellent risk management - avg loss only $45</li>
                  <li>• Strong morning performance (9:30-11:00)</li>
                  <li>• Good at cutting losses quickly</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-red-900 mb-3 flex items-center">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-2" />
                  Repeating Mistakes
                </h4>
                <ul className="space-y-2 text-sm text-red-800">
                  <li>• Overtrading in lunch hour (12-1 PM)</li>
                  <li>• Taking profits too early on winners</li>
                  <li>• Revenge trading after 2 losses</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-2" />
                  3 Fixes for Tomorrow
                </h4>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li>• Avoid trading 12-1 PM completely</li>
                  <li>• Let winners run to 2:1 R ratio minimum</li>
                  <li>• Take break after 2 consecutive losses</li>
                </ul>
              </div>
            </div>

            <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-slate-800 mb-2">Key Insight</h4>
              <p className="text-slate-700">
                Your best trading happens in the first 90 minutes of the session. Consider concentrating 
                more of your risk budget during this time and reducing position sizes after 11 AM.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AutoJournal;
