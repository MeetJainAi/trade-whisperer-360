import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart3, ArrowLeft, TrendingUp, TrendingDown, Percent, Clock, BookOpen, Scale, CalendarDays, Tags, Target, Brain, AlertTriangle, Info, Trophy, Shield, Zap, Activity, PieChart, BarChart, LineChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, Cell, PieChart as RechartsPieChart, Pie, Area, AreaChart, ComposedChart, Scatter, ScatterChart } from 'recharts';
import { Tables } from '@/integrations/supabase/types';
import TradesLogTable from './TradesLogTable';
import { calculateMetrics } from "@/lib/trade-metrics";

type TradeSessionWithTrades = Tables<'trade_sessions'> & { trades: Tables<'trades'>[] };

interface AnalysisViewProps {
  currentSession: TradeSessionWithTrades;
  onUploadNew: () => void;
}

const AnalysisView = ({ currentSession, onUploadNew }: AnalysisViewProps) => {
  const navigate = useNavigate();

  const extendedMetrics = useMemo(() => {
    return calculateMetrics(currentSession.trades);
  }, [currentSession.trades]);

  // Advanced Analytics Calculations
  const advancedAnalytics = useMemo(() => {
    const trades = currentSession.trades;
    if (!trades || trades.length === 0) return null;

    // Risk Metrics
    const returns = trades.map(t => t.pnl || 0);
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const var95 = sortedReturns[Math.floor(returns.length * 0.05)] || 0; // Value at Risk 95%
    const sharpeRatio = returns.length > 1 ? (extendedMetrics.total_pnl / returns.length) / (Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - (extendedMetrics.total_pnl / returns.length), 2), 0) / returns.length) || 1) : 0;

    // Time-based Performance
    const hourlyPerformance: { [key: number]: { pnl: number; trades: number; winRate: number } } = {};
    const dailyPerformance: { [key: string]: { pnl: number; trades: number; winRate: number } } = {};
    const monthlyPerformance: { [key: string]: { pnl: number; trades: number; winRate: number } } = {};

    trades.forEach(trade => {
      if (trade.datetime) {
        const date = new Date(trade.datetime);
        const hour = date.getHours();
        const day = date.toLocaleDateString('en-US', { weekday: 'long' });
        const month = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const pnl = trade.pnl || 0;

        // Hourly
        if (!hourlyPerformance[hour]) hourlyPerformance[hour] = { pnl: 0, trades: 0, winRate: 0 };
        hourlyPerformance[hour].pnl += pnl;
        hourlyPerformance[hour].trades += 1;

        // Daily
        if (!dailyPerformance[day]) dailyPerformance[day] = { pnl: 0, trades: 0, winRate: 0 };
        dailyPerformance[day].pnl += pnl;
        dailyPerformance[day].trades += 1;

        // Monthly
        if (!monthlyPerformance[month]) monthlyPerformance[month] = { pnl: 0, trades: 0, winRate: 0 };
        monthlyPerformance[month].pnl += pnl;
        monthlyPerformance[month].trades += 1;
      }
    });

    // Calculate win rates
    Object.keys(hourlyPerformance).forEach(hour => {
      const winners = trades.filter(t => t.datetime && new Date(t.datetime).getHours() === parseInt(hour) && (t.pnl || 0) > 0).length;
      hourlyPerformance[parseInt(hour)].winRate = hourlyPerformance[parseInt(hour)].trades > 0 ? (winners / hourlyPerformance[parseInt(hour)].trades) * 100 : 0;
    });

    // Symbol Performance Analysis
    const symbolStats: { [key: string]: { pnl: number; trades: number; winRate: number; avgPnl: number } } = {};
    trades.forEach(trade => {
      const symbol = trade.symbol || 'Unknown';
      const pnl = trade.pnl || 0;
      
      if (!symbolStats[symbol]) symbolStats[symbol] = { pnl: 0, trades: 0, winRate: 0, avgPnl: 0 };
      symbolStats[symbol].pnl += pnl;
      symbolStats[symbol].trades += 1;
    });

    Object.keys(symbolStats).forEach(symbol => {
      const winners = trades.filter(t => t.symbol === symbol && (t.pnl || 0) > 0).length;
      symbolStats[symbol].winRate = symbolStats[symbol].trades > 0 ? (winners / symbolStats[symbol].trades) * 100 : 0;
      symbolStats[symbol].avgPnl = symbolStats[symbol].pnl / symbolStats[symbol].trades;
    });

    // Strategy Performance (if available)
    const strategyStats: { [key: string]: { pnl: number; trades: number; winRate: number } } = {};
    trades.forEach(trade => {
      const strategy = (trade as any).strategy || 'No Strategy';
      const pnl = trade.pnl || 0;
      
      if (!strategyStats[strategy]) strategyStats[strategy] = { pnl: 0, trades: 0, winRate: 0 };
      strategyStats[strategy].pnl += pnl;
      strategyStats[strategy].trades += 1;
    });

    // Consecutive Wins/Losses Analysis
    let currentStreak = 0;
    let streakType: 'win' | 'loss' | 'none' = 'none';
    const streaks: { type: 'win' | 'loss'; length: number; startDate: string }[] = [];

    trades.forEach((trade, index) => {
      const pnl = trade.pnl || 0;
      const isWin = pnl > 0;
      const isLoss = pnl < 0;

      if (isWin && streakType !== 'win') {
        if (streakType === 'loss' && currentStreak > 0) {
          streaks.push({ type: 'loss', length: currentStreak, startDate: trade.datetime || '' });
        }
        currentStreak = 1;
        streakType = 'win';
      } else if (isWin && streakType === 'win') {
        currentStreak++;
      } else if (isLoss && streakType !== 'loss') {
        if (streakType === 'win' && currentStreak > 0) {
          streaks.push({ type: 'win', length: currentStreak, startDate: trade.datetime || '' });
        }
        currentStreak = 1;
        streakType = 'loss';
      } else if (isLoss && streakType === 'loss') {
        currentStreak++;
      }
    });

    // Trading Psychology Metrics
    const revengeTradeIndicators = trades.filter((trade, index) => {
      if (index === 0) return false;
      const prevTrade = trades[index - 1];
      const timeDiff = new Date(trade.datetime || 0).getTime() - new Date(prevTrade.datetime || 0).getTime();
      return (prevTrade.pnl || 0) < 0 && timeDiff < 5 * 60 * 1000; // Within 5 minutes of a loss
    }).length;

    const overconfidenceIndicators = trades.filter((trade, index) => {
      if (index < 2) return false;
      const prev2Trades = trades.slice(index - 2, index);
      const allWins = prev2Trades.every(t => (t.pnl || 0) > 0);
      const currentSize = trade.qty || 0;
      const avgSize = trades.slice(0, index).reduce((sum, t) => sum + (t.qty || 0), 0) / index;
      return allWins && currentSize > avgSize * 1.5; // 50% larger position after 2 wins
    }).length;

    return {
      riskMetrics: {
        valueAtRisk95: var95,
        sharpeRatio,
        maxConsecutiveLosses: Math.max(...streaks.filter(s => s.type === 'loss').map(s => s.length), 0),
        riskOfRuin: extendedMetrics.total_pnl < 0 ? Math.min(95, Math.abs(extendedMetrics.total_pnl) / 1000 * 100) : 0
      },
      timeAnalysis: {
        hourlyPerformance,
        dailyPerformance,
        monthlyPerformance
      },
      instrumentAnalysis: symbolStats,
      strategyAnalysis: strategyStats,
      psychologyMetrics: {
        revengeTradeCount: revengeTradeIndicators,
        overconfidenceCount: overconfidenceIndicators,
        emotionalTradePercentage: ((revengeTradeIndicators + overconfidenceIndicators) / trades.length) * 100
      },
      streakAnalysis: streaks
    };
  }, [currentSession.trades, extendedMetrics]);

  // Performance Rating
  const performanceRating = useMemo(() => {
    let score = 0;
    let maxScore = 0;

    // P&L Score (25 points)
    maxScore += 25;
    if (extendedMetrics.total_pnl > 0) score += 25;
    else if (extendedMetrics.total_pnl > -100) score += 15;
    else if (extendedMetrics.total_pnl > -500) score += 5;

    // Win Rate Score (20 points)
    maxScore += 20;
    if (extendedMetrics.win_rate >= 60) score += 20;
    else if (extendedMetrics.win_rate >= 50) score += 15;
    else if (extendedMetrics.win_rate >= 40) score += 10;
    else if (extendedMetrics.win_rate >= 30) score += 5;

    // Profit Factor Score (20 points)
    maxScore += 20;
    if (extendedMetrics.profit_factor >= 2) score += 20;
    else if (extendedMetrics.profit_factor >= 1.5) score += 15;
    else if (extendedMetrics.profit_factor >= 1.2) score += 10;
    else if (extendedMetrics.profit_factor >= 1) score += 5;

    // Risk Management Score (20 points)
    maxScore += 20;
    if (advancedAnalytics?.riskMetrics.maxConsecutiveLosses <= 3) score += 20;
    else if (advancedAnalytics?.riskMetrics.maxConsecutiveLosses <= 5) score += 15;
    else if (advancedAnalytics?.riskMetrics.maxConsecutiveLosses <= 7) score += 10;
    else score += 5;

    // Psychology Score (15 points)
    maxScore += 15;
    if (advancedAnalytics?.psychologyMetrics.emotionalTradePercentage <= 5) score += 15;
    else if (advancedAnalytics?.psychologyMetrics.emotionalTradePercentage <= 10) score += 10;
    else if (advancedAnalytics?.psychologyMetrics.emotionalTradePercentage <= 20) score += 5;

    const percentage = (score / maxScore) * 100;
    
    if (percentage >= 80) return { score: percentage, grade: 'A+', color: 'green', description: 'Excellent' };
    if (percentage >= 70) return { score: percentage, grade: 'A', color: 'green', description: 'Very Good' };
    if (percentage >= 60) return { score: percentage, grade: 'B+', color: 'blue', description: 'Good' };
    if (percentage >= 50) return { score: percentage, grade: 'B', color: 'blue', description: 'Average' };
    if (percentage >= 40) return { score: percentage, grade: 'C', color: 'yellow', description: 'Below Average' };
    return { score: percentage, grade: 'D', color: 'red', description: 'Needs Improvement' };
  }, [extendedMetrics, advancedAnalytics]);

  const MetricCard = ({ title, value, description, icon: Icon, color = "blue", tooltip, trend }: any) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-help">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <Icon className={`w-4 h-4 text-${color}-600`} />
                    <p className="text-sm font-medium text-slate-600">{title}</p>
                    {trend && (
                      <Badge variant={trend > 0 ? "default" : "destructive"} className="text-xs">
                        {trend > 0 ? '↗' : '↘'} {Math.abs(trend).toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
                  <p className="text-xs text-slate-500 mt-1">{description}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-${color}-100 flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 text-${color}-600`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold">{title}</p>
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

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
                <h1 className="text-2xl font-bold text-slate-800">Comprehensive Trade Analysis</h1>
                <p className="text-sm text-slate-600">{currentSession.total_trades} trades • {new Date(currentSession.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="text-sm text-slate-600">Performance Grade</p>
                <Badge variant={performanceRating.grade.includes('A') ? 'default' : performanceRating.grade.includes('B') ? 'secondary' : 'destructive'} className="text-lg px-3 py-1">
                  {performanceRating.grade}
                </Badge>
              </div>
              <Button variant="outline" onClick={onUploadNew} className="border-slate-300">
                Upload New Session
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Performance Overview */}
        <Card className="mb-8 border-0 shadow-xl bg-gradient-to-r from-blue-600 to-green-500 text-white">
          <CardContent className="pt-8">
            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                  <Trophy className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold">{performanceRating.grade}</h3>
                <p className="text-blue-100">Overall Grade</p>
                <p className="text-xs text-blue-200 mt-1">{performanceRating.description}</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                  <Target className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold">{performanceRating.score.toFixed(1)}%</h3>
                <p className="text-blue-100">Performance Score</p>
                <Progress value={performanceRating.score} className="mt-2 bg-white/20" />
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold">
                  {extendedMetrics.total_pnl >= 0 ? '+' : ''}${extendedMetrics.total_pnl.toFixed(2)}
                </h3>
                <p className="text-blue-100">Total P&L</p>
                <p className="text-xs text-blue-200 mt-1">
                  ${extendedMetrics.expectancy.toFixed(2)} per trade
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold">
                  {advancedAnalytics?.psychologyMetrics.emotionalTradePercentage.toFixed(1)}%
                </h3>
                <p className="text-blue-100">Emotional Trading</p>
                <p className="text-xs text-blue-200 mt-1">Lower is better</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview" className="flex items-center space-x-2">
              <BarChart className="w-4 h-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4" />
              <span>Performance</span>
            </TabsTrigger>
            <TabsTrigger value="risk" className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>Risk Analysis</span>
            </TabsTrigger>
            <TabsTrigger value="psychology" className="flex items-center space-x-2">
              <Brain className="w-4 h-4" />
              <span>Psychology</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center space-x-2">
              <Zap className="w-4 h-4" />
              <span>AI Insights</span>
            </TabsTrigger>
            <TabsTrigger value="trades" className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4" />
              <span>Trade Log</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Core Metrics */}
            <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-6">
              <MetricCard
                title="Win Rate"
                value={`${extendedMetrics.win_rate.toFixed(1)}%`}
                description="Percentage of winning trades"
                icon={Target}
                color="green"
                tooltip="The percentage of trades that were profitable. Industry average is around 50-60%."
              />
              <MetricCard
                title="Profit Factor"
                value={extendedMetrics.profit_factor >= 9999 ? '∞' : extendedMetrics.profit_factor.toFixed(2)}
                description="Gross profit ÷ Gross loss"
                icon={Scale}
                color="blue"
                tooltip="Measures how much you make for every dollar you lose. Above 1.5 is considered good."
              />
              <MetricCard
                title="Sharpe Ratio"
                value={advancedAnalytics?.riskMetrics.sharpeRatio.toFixed(2) || '0.00'}
                description="Risk-adjusted returns"
                icon={Activity}
                color="purple"
                tooltip="Measures return per unit of risk. Above 1.0 is good, above 2.0 is excellent."
              />
              <MetricCard
                title="Max Drawdown"
                value={`$${extendedMetrics.max_drawdown.toFixed(2)}`}
                description="Largest peak-to-trough loss"
                icon={TrendingDown}
                color="red"
                tooltip="The maximum loss from a peak to a trough. Smaller is better for risk management."
              />
            </div>

            {/* Charts Row 1 */}
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <LineChart className="w-5 h-5 text-green-600" />
                    <span>Equity Curve</span>
                  </CardTitle>
                  <CardDescription>Your account balance over time - the holy grail of trading</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={currentSession.equity_curve as any[]}>
                      <defs>
                        <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="trade" />
                      <YAxis />
                      <RechartsTooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cumulative P&L']} />
                      <Area type="monotone" dataKey="cumulative" stroke="#10b981" fillOpacity={1} fill="url(#equityGradient)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <BarChart className="w-5 h-5 text-blue-600" />
                    <span>P&L Distribution</span>
                  </CardTitle>
                  <CardDescription>How your wins and losses are distributed</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={[
                      { range: '$0-$50', count: currentSession.trades.filter(t => (t.pnl || 0) >= 0 && (t.pnl || 0) <= 50).length },
                      { range: '$50-$100', count: currentSession.trades.filter(t => (t.pnl || 0) > 50 && (t.pnl || 0) <= 100).length },
                      { range: '$100+', count: currentSession.trades.filter(t => (t.pnl || 0) > 100).length },
                      { range: '$0 to -$50', count: currentSession.trades.filter(t => (t.pnl || 0) < 0 && (t.pnl || 0) >= -50).length },
                      { range: '-$50 to -$100', count: currentSession.trades.filter(t => (t.pnl || 0) < -50 && (t.pnl || 0) >= -100).length },
                      { range: '-$100-', count: currentSession.trades.filter(t => (t.pnl || 0) < -100).length },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range" />
                      <YAxis />
                      <RechartsTooltip />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            {/* Performance Breakdown */}
            <div className="grid lg:grid-cols-3 gap-6">
              <MetricCard
                title="Average Win"
                value={`$${extendedMetrics.avg_win.toFixed(2)}`}
                description="Average profit per winning trade"
                icon={TrendingUp}
                color="green"
                tooltip="Your average profit when you win. Higher is better for scaling your account."
              />
              <MetricCard
                title="Average Loss"
                value={`$${Math.abs(extendedMetrics.avg_loss).toFixed(2)}`}
                description="Average loss per losing trade"
                icon={TrendingDown}
                color="red"
                tooltip="Your average loss when you lose. Smaller is better for risk control."
              />
              <MetricCard
                title="Risk/Reward Ratio"
                value={`${extendedMetrics.reward_risk_ratio.toFixed(2)}:1`}
                description="Average win vs average loss"
                icon={Scale}
                color="blue"
                tooltip="How much you make vs how much you lose. Above 1.5:1 is considered good."
              />
            </div>

            {/* Time-based Performance */}
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <span>Hourly Performance</span>
                  </CardTitle>
                  <CardDescription>Find your most profitable trading hours</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={Object.entries(advancedAnalytics?.timeAnalysis.hourlyPerformance || {}).map(([hour, data]) => ({
                      hour: `${hour}:00`,
                      pnl: data.pnl,
                      winRate: data.winRate,
                      trades: data.trades
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <RechartsTooltip />
                      <Bar yAxisId="left" dataKey="pnl" fill="#3b82f6" name="P&L" />
                      <Line yAxisId="right" type="monotone" dataKey="winRate" stroke="#10b981" strokeWidth={2} name="Win Rate %" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CalendarDays className="w-5 h-5 text-purple-600" />
                    <span>Daily Performance</span>
                  </CardTitle>
                  <CardDescription>Your best and worst trading days</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={Object.entries(advancedAnalytics?.timeAnalysis.dailyPerformance || {}).map(([day, data]) => ({
                      day,
                      pnl: data.pnl,
                      trades: data.trades,
                      winRate: data.winRate
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <RechartsTooltip formatter={(value: number, name: string) => {
                        if (name === 'pnl') return [`$${value.toFixed(2)}`, 'P&L'];
                        if (name === 'winRate') return [`${value.toFixed(1)}%`, 'Win Rate'];
                        return [value, name];
                      }} />
                      <Bar dataKey="pnl">
                        {Object.entries(advancedAnalytics?.timeAnalysis.dailyPerformance || {}).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry[1].pnl >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Symbol Performance */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Tags className="w-5 h-5 text-green-600" />
                  <span>Top Performing Instruments</span>
                </CardTitle>
                <CardDescription>Which stocks/symbols make you the most money</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(advancedAnalytics?.instrumentAnalysis || {})
                    .sort(([,a], [,b]) => b.pnl - a.pnl)
                    .slice(0, 6)
                    .map(([symbol, stats], index) => (
                      <div key={symbol} className={`p-4 rounded-lg border-l-4 ${stats.pnl >= 0 ? 'border-l-green-500 bg-green-50' : 'border-l-red-500 bg-red-50'}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-lg">{symbol}</h4>
                            <p className={`text-sm ${stats.pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {stats.pnl >= 0 ? '+' : ''}${stats.pnl.toFixed(2)}
                            </p>
                          </div>
                          <Badge variant={stats.pnl >= 0 ? 'default' : 'destructive'}>
                            #{index + 1}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-slate-600">
                          <p>{stats.trades} trades • {stats.winRate.toFixed(1)}% win rate</p>
                          <p>Avg: ${stats.avgPnl.toFixed(2)} per trade</p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risk" className="space-y-6">
            {/* Risk Metrics */}
            <div className="grid lg:grid-cols-4 gap-6">
              <MetricCard
                title="Value at Risk (95%)"
                value={`$${Math.abs(advancedAnalytics?.riskMetrics.valueAtRisk95 || 0).toFixed(2)}`}
                description="Max expected loss (95% confidence)"
                icon={AlertTriangle}
                color="red"
                tooltip="There's a 5% chance you'll lose more than this amount on any given trade."
              />
              <MetricCard
                title="Max Consecutive Losses"
                value={`${advancedAnalytics?.riskMetrics.maxConsecutiveLosses || 0}`}
                description="Longest losing streak"
                icon={TrendingDown}
                color="orange"
                tooltip="Your longest string of losses in a row. Important for position sizing."
              />
              <MetricCard
                title="Risk of Ruin"
                value={`${(advancedAnalytics?.riskMetrics.riskOfRuin || 0).toFixed(1)}%`}
                description="Probability of significant loss"
                icon={Shield}
                color="red"
                tooltip="Estimated probability of losing a significant portion of your account."
              />
              <MetricCard
                title="Largest Single Loss"
                value={`$${Math.abs(extendedMetrics.largest_loss).toFixed(2)}`}
                description="Worst individual trade"
                icon={TrendingDown}
                color="red"
                tooltip="Your single worst trade. This should be controlled with stop losses."
              />
            </div>

            {/* Risk Analysis Charts */}
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Activity className="w-5 h-5 text-red-600" />
                    <span>Drawdown Analysis</span>
                  </CardTitle>
                  <CardDescription>How deep your losses go before recovery</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={currentSession.equity_curve as any[]}>
                      <defs>
                        <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="trade" />
                      <YAxis />
                      <RechartsTooltip />
                      <Area type="monotone" dataKey="cumulative" stroke="#ef4444" fill="url(#drawdownGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <PieChart className="w-5 h-5 text-blue-600" />
                    <span>Win/Loss Distribution</span>
                  </CardTitle>
                  <CardDescription>Visual breakdown of your trading outcomes</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={[
                          { name: 'Winning Trades', value: currentSession.trades.filter(t => (t.pnl || 0) > 0).length, fill: '#10b981' },
                          { name: 'Losing Trades', value: currentSession.trades.filter(t => (t.pnl || 0) < 0).length, fill: '#ef4444' },
                          { name: 'Breakeven Trades', value: currentSession.trades.filter(t => (t.pnl || 0) === 0).length, fill: '#6b7280' }
                        ]}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                      />
                      <RechartsTooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Risk Recommendations */}
            <Card className="border-0 shadow-lg border-l-4 border-l-amber-500">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-amber-700">
                  <Shield className="w-5 h-5" />
                  <span>Risk Management Recommendations</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {advancedAnalytics?.riskMetrics.maxConsecutiveLosses > 5 && (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-red-800 font-medium">⚠️ High Consecutive Losses</p>
                      <p className="text-red-700 text-sm">Consider reducing position size after 3 consecutive losses.</p>
                    </div>
                  )}
                  {extendedMetrics.largest_loss < -100 && (
                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                      <p className="text-orange-800 font-medium">🛑 Large Single Loss Detected</p>
                      <p className="text-orange-700 text-sm">Implement stricter stop-loss rules to limit individual trade risk.</p>
                    </div>
                  )}
                  {extendedMetrics.profit_factor < 1.2 && (
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-yellow-800 font-medium">📊 Low Profit Factor</p>
                      <p className="text-yellow-700 text-sm">Focus on cutting losses quickly and letting winners run longer.</p>
                    </div>
                  )}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-blue-800 font-medium">💡 Pro Tip</p>
                    <p className="text-blue-700 text-sm">Never risk more than 1-2% of your account on any single trade. Your largest loss should not exceed this limit.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="psychology" className="space-y-6">
            {/* Psychology Metrics */}
            <div className="grid lg:grid-cols-3 gap-6">
              <MetricCard
                title="Revenge Trades"
                value={`${advancedAnalytics?.psychologyMetrics.revengeTradeCount || 0}`}
                description="Trades made within 5min of loss"
                icon={AlertTriangle}
                color="red"
                tooltip="Quick trades after losses often indicate emotional decision-making."
              />
              <MetricCard
                title="Overconfidence Trades"
                value={`${advancedAnalytics?.psychologyMetrics.overconfidenceCount || 0}`}
                description="Oversized positions after wins"
                icon={TrendingUp}
                color="orange"
                tooltip="Larger positions after wins may indicate overconfidence bias."
              />
              <MetricCard
                title="Emotional Trading %"
                value={`${(advancedAnalytics?.psychologyMetrics.emotionalTradePercentage || 0).toFixed(1)}%`}
                description="Percentage of emotion-driven trades"
                icon={Brain}
                color="purple"
                tooltip="Lower percentages indicate better emotional control."
              />
            </div>

            {/* Streak Analysis */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-green-600" />
                  <span>Winning & Losing Streaks</span>
                </CardTitle>
                <CardDescription>Understanding your hot and cold periods</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-green-800 mb-3">Winning Streaks</h4>
                    <div className="space-y-2">
                      {advancedAnalytics?.streakAnalysis
                        .filter(s => s.type === 'win')
                        .sort((a, b) => b.length - a.length)
                        .slice(0, 5)
                        .map((streak, index) => (
                          <div key={index} className="flex justify-between items-center p-2 bg-green-50 rounded">
                            <span className="text-green-800">{streak.length} consecutive wins</span>
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              {new Date(streak.startDate).toLocaleDateString()}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-red-800 mb-3">Losing Streaks</h4>
                    <div className="space-y-2">
                      {advancedAnalytics?.streakAnalysis
                        .filter(s => s.type === 'loss')
                        .sort((a, b) => b.length - a.length)
                        .slice(0, 5)
                        .map((streak, index) => (
                          <div key={index} className="flex justify-between items-center p-2 bg-red-50 rounded">
                            <span className="text-red-800">{streak.length} consecutive losses</span>
                            <Badge variant="destructive" className="bg-red-100 text-red-800">
                              {new Date(streak.startDate).toLocaleDateString()}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Psychology Insights */}
            <Card className="border-0 shadow-lg border-l-4 border-l-purple-500">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-purple-700">
                  <Brain className="w-5 h-5" />
                  <span>Trading Psychology Analysis</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <h4 className="font-semibold text-purple-800 mb-2">🧠 Behavioral Patterns</h4>
                    <div className="space-y-2 text-sm text-purple-700">
                      {advancedAnalytics?.psychologyMetrics.emotionalTradePercentage <= 5 ? (
                        <p>✅ Excellent emotional control - you're trading like a machine!</p>
                      ) : advancedAnalytics?.psychologyMetrics.emotionalTradePercentage <= 15 ? (
                        <p>⚠️ Some emotional trading detected - work on patience and discipline.</p>
                      ) : (
                        <p>🚨 High emotional trading - consider taking breaks after losses.</p>
                      )}
                      
                      {extendedMetrics.max_win_streak > 5 && (
                        <p>📈 You have strong winning capabilities - focus on consistency.</p>
                      )}
                      
                      {extendedMetrics.max_loss_streak > 5 && (
                        <p>📉 Long losing streaks detected - review your risk management.</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-2">💡 Recommendations for Better Psychology</h4>
                    <ul className="space-y-1 text-sm text-blue-700">
                      <li>• Take a 15-minute break after any loss before placing the next trade</li>
                      <li>• Set daily loss limits and stick to them religiously</li>
                      <li>• Keep a trading journal with your emotional state for each trade</li>
                      <li>• Practice meditation or breathing exercises before trading sessions</li>
                      <li>• Review your worst losing streaks to identify emotional triggers</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>AI-Generated Trading Insights</CardTitle>
                <CardDescription>Personalized analysis of your trading patterns and psychology</CardDescription>
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
                  <h4 className="font-semibold text-slate-800 mb-2 flex items-center">
                    <Zap className="w-5 h-5 mr-2 text-blue-600" />
                    Key Insight
                  </h4>
                  <p className="text-slate-700">
                    {currentSession.ai_key_insight}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trades" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BookOpen className="w-5 h-5 text-gray-600" />
                  <span>Complete Trade Log</span>
                </CardTitle>
                <CardDescription>Detailed analysis of every trade with editing capabilities</CardDescription>
              </CardHeader>
              <CardContent>
                <TradesLogTable trades={currentSession.trades} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AnalysisView;