import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { 
  BookOpen, 
  Plus, 
  Edit, 
  Trash2, 
  TrendingUp, 
  Target, 
  Shield, 
  Brain, 
  BarChart3,
  ArrowLeft,
  Sparkles,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign
} from 'lucide-react';

type TradingPlaybook = Tables<'trading_playbooks'>;
type PlaybookPerformance = Tables<'playbook_performance'>;

const PlaybookManager = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<TradingPlaybook | null>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    strategy_type: '',
    market_conditions: '',
    psychology_notes: '',
    detailed_content: '',
    tags: [] as string[]
  });

  // Fetch playbooks
  const { data: playbooks, isLoading } = useQuery<TradingPlaybook[]>({
    queryKey: ['playbooks', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('trading_playbooks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch playbook performance
  const { data: performance } = useQuery<PlaybookPerformance[]>({
    queryKey: ['playbook_performance', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('playbook_performance')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Create playbook mutation
  const createPlaybookMutation = useMutation({
    mutationFn: async (newPlaybook: TablesInsert<'trading_playbooks'>) => {
      const { data, error } = await supabase
        .from('trading_playbooks')
        .insert(newPlaybook)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks', user?.id] });
      toast({ title: "Success!", description: "Playbook created successfully." });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Generate AI insights
  const generateInsights = async (playbookData: any) => {
    if (!user) return;
    
    setIsGeneratingInsights(true);
    try {
      // Get user's recent trades for context
      const { data: trades } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .order('datetime', { ascending: false })
        .limit(50);

      const { data: insights, error } = await supabase.functions.invoke('generate-playbook-insights', {
        body: {
          playbookData,
          userTrades: trades,
          action: 'create_playbook'
        }
      });

      if (error) throw error;

      // Update form with AI insights
      setFormData(prev => ({
        ...prev,
        detailed_content: insights.detailed_content || prev.detailed_content,
        psychology_notes: insights.psychology_notes || prev.psychology_notes
      }));

      toast({ title: "AI Insights Generated!", description: "Your playbook has been enhanced with AI recommendations." });
    } catch (error: any) {
      console.error('Error generating insights:', error);
      toast({ title: "Error", description: "Failed to generate AI insights.", variant: "destructive" });
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      strategy_type: '',
      market_conditions: '',
      psychology_notes: '',
      detailed_content: '',
      tags: []
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const newPlaybook: TablesInsert<'trading_playbooks'> = {
      user_id: user.id,
      ...formData,
    };

    createPlaybookMutation.mutate(newPlaybook);
  };

  const getPerformanceForPlaybook = (playbookId: string) => {
    return performance?.find(p => p.playbook_id === playbookId);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

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
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-600 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Trading Playbooks</h1>
                <p className="text-sm text-slate-600">Create and manage your trading strategies</p>
              </div>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Playbook
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center space-x-2">
                    <BookOpen className="w-5 h-5 text-purple-600" />
                    <span>Create New Trading Playbook</span>
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Playbook Name *
                      </label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., Morning Breakout Strategy"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Strategy Type
                      </label>
                      <Select
                        value={formData.strategy_type}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, strategy_type: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select strategy type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="breakout">Breakout</SelectItem>
                          <SelectItem value="trend-following">Trend Following</SelectItem>
                          <SelectItem value="mean-reversion">Mean Reversion</SelectItem>
                          <SelectItem value="scalping">Scalping</SelectItem>
                          <SelectItem value="swing">Swing Trading</SelectItem>
                          <SelectItem value="momentum">Momentum</SelectItem>
                          <SelectItem value="contrarian">Contrarian</SelectItem>
                          <SelectItem value="arbitrage">Arbitrage</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Description
                    </label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief overview of your trading strategy..."
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Market Conditions
                    </label>
                    <Textarea
                      value={formData.market_conditions}
                      onChange={(e) => setFormData(prev => ({ ...prev, market_conditions: e.target.value }))}
                      placeholder="When does this strategy work best? (e.g., trending markets, high volatility, specific times of day...)"
                      rows={3}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-slate-700">
                        Detailed Strategy Content
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => generateInsights(formData)}
                        disabled={isGeneratingInsights || !formData.name}
                        className="border-purple-300 text-purple-600 hover:bg-purple-50"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        {isGeneratingInsights ? 'Generating...' : 'AI Enhance'}
                      </Button>
                    </div>
                    <Textarea
                      value={formData.detailed_content}
                      onChange={(e) => setFormData(prev => ({ ...prev, detailed_content: e.target.value }))}
                      placeholder="Detailed strategy description, entry/exit rules, risk management, examples..."
                      rows={8}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Psychology & Mental Notes
                    </label>
                    <Textarea
                      value={formData.psychology_notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, psychology_notes: e.target.value }))}
                      placeholder="Mental preparation, emotional management, common psychological pitfalls to avoid..."
                      rows={4}
                    />
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createPlaybookMutation.isPending || !formData.name}
                      className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600"
                    >
                      {createPlaybookMutation.isPending ? 'Creating...' : 'Create Playbook'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-slate-200 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : playbooks && playbooks.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {playbooks.map((playbook) => {
              const perf = getPerformanceForPlaybook(playbook.id);
              return (
                <Card key={playbook.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-bold text-slate-800 mb-1">
                          {playbook.name}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {playbook.description || 'No description provided'}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="ml-2">
                        {playbook.strategy_type || 'Strategy'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {perf && (
                      <div className="bg-slate-50 rounded-lg p-3 mb-4">
                        <div className="grid grid-cols-2 gap-3 text-center">
                          <div>
                            <p className="text-xs text-slate-500">Total P&L</p>
                            <p className={`text-sm font-semibold ${
                              (perf.total_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatCurrency(perf.total_pnl || 0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Win Rate</p>
                            <p className="text-sm font-semibold text-blue-600">
                              {(perf.win_rate || 0).toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Trades</p>
                            <p className="text-sm font-semibold text-slate-700">
                              {perf.total_trades || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Profit Factor</p>
                            <p className="text-sm font-semibold text-purple-600">
                              {(perf.profit_factor || 0).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-slate-500">
                        Created {new Date(playbook.created_at).toLocaleDateString()}
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPlaybook(playbook);
                            // Navigate to detailed view
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-center py-10">
                <div className="w-16 h-16 rounded-full bg-purple-100 mx-auto mb-4 flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">No Playbooks Yet</h3>
                <p className="text-slate-600 mb-6 max-w-md mx-auto">
                  Create your first trading playbook to document your strategies and track their performance.
                </p>
                <Button 
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600"
                >
                  <Plus className="mr-2 h-4 w-4" /> Create Your First Playbook
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PlaybookManager;