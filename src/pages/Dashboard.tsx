import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Brain, Target, Calendar, TrendingUp, AlertCircle, CheckCircle, Clock, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();
  const [currentTime] = useState(new Date());
  
  const isMarketHours = currentTime.getHours() >= 9 && currentTime.getHours() < 16;
  const isPreMarket = currentTime.getHours() >= 6 && currentTime.getHours() < 9;

  const todayStats = {
    biasCheck: { completed: true, status: 'yellow', riskLevel: '$50/trade', mantra: 'Size down, stay patient' },
    trades: { count: 8, pnl: 145.50, winRate: 75 },
    emotions: { primary: 'Confident', sessions: 2 }
  };

  const weekProgress = {
    consistency: 85,
    emotionalControl: 72,
    riskManagement: 90
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-green-500 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                <p className="text-sm text-slate-600">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              className="border-slate-300"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Market Status Banner */}
        <Card className="mb-8 border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${isMarketHours ? 'bg-green-500' : isPreMarket ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="font-semibold text-slate-800">
                  {isMarketHours ? 'Market Open' : isPreMarket ? 'Pre-Market' : 'Market Closed'}
                </span>
              </div>
              <Badge variant={isMarketHours ? 'default' : 'secondary'}>
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-200 border-0 shadow-md"
            onClick={() => navigate('/bias-check')}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Bias Check</CardTitle>
                    <CardDescription>Pre-market assessment</CardDescription>
                  </div>
                </div>
                {todayStats.biasCheck.completed ? (
                  <CheckCircle className="w-6 h-6 text-green-500" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-yellow-500" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {todayStats.biasCheck.completed ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Status:</span>
                    <Badge variant={todayStats.biasCheck.status === 'green' ? 'default' : 'secondary'}>
                      {todayStats.biasCheck.status === 'yellow' ? 'Cautious' : 'Good to Go'}
                    </Badge>
                  </div>
                  <div className="text-sm text-slate-600">
                    Risk: <span className="font-medium">{todayStats.biasCheck.riskLevel}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    Mantra: <em>"{todayStats.biasCheck.mantra}"</em>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">Complete your pre-market assessment</p>
              )}
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-200 border-0 shadow-md"
            onClick={() => navigate('/journals')}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Auto-Journal</CardTitle>
                    <CardDescription>Trade analysis</CardDescription>
                  </div>
                </div>
                <Badge variant="outline">
                  {todayStats.trades.count} trades
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Today's P&L:</span>
                  <span className={`font-medium ${todayStats.trades.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${todayStats.trades.pnl >= 0 ? '+' : ''}{todayStats.trades.pnl}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Win Rate:</span>
                  <span className="font-medium text-slate-800">{todayStats.trades.winRate}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-200 border-0 shadow-md"
            onClick={() => navigate('/mindset-mirror')}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Mindset Mirror</CardTitle>
                    <CardDescription>Emotional insights</CardDescription>
                  </div>
                </div>
                <Badge variant="outline">
                  {todayStats.emotions.sessions} sessions
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Primary Emotion:</span>
                  <span className="font-medium text-slate-800">{todayStats.emotions.primary}</span>
                </div>
                <div className="text-sm text-slate-600">
                  Last session: <span className="font-medium">2 hours ago</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-200 border-0 shadow-md"
            onClick={() => navigate('/playbooks')}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Trading Playbooks</CardTitle>
                    <CardDescription>Strategy management</CardDescription>
                  </div>
                </div>
                <Badge variant="outline">
                  3 active
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Best Performer:</span>
                  <span className="font-medium text-green-600">Breakout Strategy</span>
                </div>
                <div className="text-sm text-slate-600">
                  Win Rate: <span className="font-medium">72%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weekly Progress */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span>Weekly Progress</span>
            </CardTitle>
            <CardDescription>Your improvement metrics for this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Consistency</span>
                  <span className="text-sm text-slate-600">{weekProgress.consistency}%</span>
                </div>
                <Progress value={weekProgress.consistency} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Emotional Control</span>
                  <span className="text-sm text-slate-600">{weekProgress.emotionalControl}%</span>
                </div>
                <Progress value={weekProgress.emotionalControl} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Risk Management</span>
                  <span className="text-sm text-slate-600">{weekProgress.riskManagement}%</span>
                </div>
                <Progress value={weekProgress.riskManagement} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Insights */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Insights</CardTitle>
            <CardDescription>AI-generated observations from your trading patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-l-blue-500">
                <h4 className="font-medium text-blue-900 mb-2">Pattern Recognition</h4>
                <p className="text-sm text-blue-800">
                  You tend to perform better on Tuesdays and Wednesdays. Consider increasing position sizes on these days.
                </p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg border-l-4 border-l-yellow-500">
                <h4 className="font-medium text-yellow-900 mb-2">Emotional Trigger</h4>
                <p className="text-sm text-yellow-800">
                  After 3 consecutive wins, you historically increase risk too much. Consider maintaining discipline.
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border-l-4 border-l-green-500">
                <h4 className="font-medium text-green-900 mb-2">Strength Identified</h4>
                <p className="text-sm text-green-800">
                  Your exit timing has improved 23% over the past month. Keep using those trailing stops!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
