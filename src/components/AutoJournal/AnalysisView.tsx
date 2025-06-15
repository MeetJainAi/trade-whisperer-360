import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, ArrowLeft, TrendingUp, TrendingDown, Percent, Clock, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Tables } from '@/integrations/supabase/types';
import TradesLogTable from './TradesLogTable';

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };

interface AnalysisViewProps {
  currentSession: TradeSessionWithTrades;
  onUploadNew: () => void;
}

const AnalysisView = ({ currentSession, onUploadNew }: AnalysisViewProps) => {
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
                <h1 className="text-2xl font-bold text-slate-800">Trade Analysis</h1>
                <p className="text-sm text-slate-600">{currentSession.total_trades} trades processed • {new Date(currentSession.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={onUploadNew}
              className="border-slate-300"
            >
              Upload New File
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
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

        <Card className="border-0 shadow-lg mt-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-gray-600" />
                <span>Trade Log</span>
            </CardTitle>
            <CardDescription>A detailed log of all trades in this session.</CardDescription>
          </CardHeader>
          <CardContent>
            <TradesLogTable trades={currentSession.trades} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AnalysisView;
