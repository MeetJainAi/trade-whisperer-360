import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { Tables } from '@/integrations/supabase/types';
import { ArrowLeft, Save, Calendar, DollarSign, TrendingUp, TrendingDown, Brain, Target, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

const TradeNotes = () => {
  const { tradeId } = useParams<{ tradeId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState('');
  const [strategy, setStrategy] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [emotions, setEmotions] = useState('');
  const [lessons, setLessons] = useState('');
  const [mistakes, setMistakes] = useState('');

  const { data: trade, isLoading, error } = useQuery<Tables<'trades'>>({
    queryKey: ['trade', tradeId],
    queryFn: async () => {
      if (!tradeId) throw new Error('No trade ID provided');
      
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!tradeId,
  });

  const updateTradeMutation = useMutation({
    mutationFn: async (updates: Partial<Tables<'trades'>>) => {
      if (!tradeId) throw new Error('No trade ID provided');
      
      const { data, error } = await supabase
        .from('trades')
        .update(updates)
        .eq('id', tradeId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', tradeId] });
      toast({ title: "Success", description: "Trade notes saved successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (trade) {
      setNotes(trade.notes || '');
      setStrategy((trade as any).strategy || '');
      setTags((trade as any).tags || []);
      
      // Parse detailed notes if they exist
      try {
        if (trade.notes) {
          const detailedNotes = JSON.parse(trade.notes);
          if (typeof detailedNotes === 'object') {
            setReasoning(detailedNotes.reasoning || '');
            setEmotions(detailedNotes.emotions || '');
            setLessons(detailedNotes.lessons || '');
            setMistakes(detailedNotes.mistakes || '');
          } else {
            // If notes is not JSON, keep it as simple notes
            setReasoning(trade.notes);
          }
        }
      } catch {
        // If notes is not JSON, keep it as simple notes
        if (trade.notes) {
          setReasoning(trade.notes);
        }
      }
    }
  }, [trade]);

  const handleSave = () => {
    const detailedNotes = {
      reasoning,
      emotions,
      lessons,
      mistakes,
      lastUpdated: new Date().toISOString()
    };

    updateTradeMutation.mutate({
      notes: JSON.stringify(detailedNotes),
      strategy,
      tags,
    } as any);
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading trade details...</p>
        </div>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600">Trade not found</p>
          <Button onClick={() => navigate(-1)} className="mt-4">
            Go Back
          </Button>
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
              <Button variant="ghost" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-600 flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Trade Analysis</h1>
                <p className="text-sm text-slate-600">
                  {trade.symbol} • {trade.datetime ? format(new Date(trade.datetime), 'PPP') : 'Unknown Date'}
                </p>
              </div>
            </div>
            <Button 
              onClick={handleSave} 
              disabled={updateTradeMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateTradeMutation.isPending ? 'Saving...' : 'Save Notes'}
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Trade Summary */}
        <Card className="mb-8 border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="w-5 h-5 text-blue-600" />
              <span>Trade Summary</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Date & Time</p>
                  <p className="font-semibold">
                    {trade.datetime ? format(new Date(trade.datetime), 'MMM dd, yyyy HH:mm') : 'Unknown'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                  <span className="font-bold text-purple-600">{trade.symbol || 'N/A'}</span>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Symbol & Side</p>
                  <p className="font-semibold">
                    {trade.symbol || 'N/A'} • 
                    <span className={`ml-1 ${trade.side === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.side || 'N/A'}
                    </span>
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">Qty × Price</p>
                  <p className="font-semibold">{trade.qty || 0} × ${(trade.price || 0).toFixed(2)}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  (trade.pnl || 0) >= 0 ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {(trade.pnl || 0) >= 0 ? (
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-slate-600">P&L</p>
                  <p className={`font-semibold text-lg ${(trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(trade.pnl || 0) >= 0 ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Strategy and Tags */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Strategy & Classification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Strategy Used</label>
                  <Input
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    placeholder="e.g., Breakout, Mean Reversion, Scalping..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {tags.map((tag, index) => (
                      <Badge 
                        key={index} 
                        variant="secondary" 
                        className="cursor-pointer hover:bg-red-100 hover:text-red-700"
                        onClick={() => removeTag(tag)}
                      >
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="Add tag..."
                      onKeyPress={(e) => e.key === 'Enter' && addTag()}
                    />
                    <Button onClick={addTag} variant="outline">Add</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <span>Quick Assessment</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Trade Quality</h4>
                  <div className="flex space-x-2">
                    {['Poor', 'Average', 'Good', 'Excellent'].map((quality) => (
                      <Badge 
                        key={quality}
                        variant={tags.includes(quality.toLowerCase()) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          if (tags.includes(quality.toLowerCase())) {
                            removeTag(quality.toLowerCase());
                          } else {
                            setTags([...tags.filter(t => !['poor', 'average', 'good', 'excellent'].includes(t)), quality.toLowerCase()]);
                          }
                        }}
                      >
                        {quality}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">Execution</h4>
                  <div className="flex flex-wrap space-x-2">
                    {['patient-entry', 'good-exit', 'followed-plan', 'emotional'].map((exec) => (
                      <Badge 
                        key={exec}
                        variant={tags.includes(exec) ? 'default' : 'outline'}
                        className="cursor-pointer mb-1"
                        onClick={() => {
                          if (tags.includes(exec)) {
                            removeTag(exec);
                          } else {
                            setTags([...tags, exec]);
                          }
                        }}
                      >
                        {exec.replace('-', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Analysis */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Trade Reasoning</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                placeholder="Why did you take this trade? What was your thesis?

• Technical setup
• Market conditions
• Catalyst or news
• Risk/reward ratio
• Confluence factors"
                className="min-h-[200px] resize-none"
              />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Emotional State</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={emotions}
                onChange={(e) => setEmotions(e.target.value)}
                placeholder="How were you feeling during this trade?

• Pre-trade emotions
• During the trade
• After exit
• Stress level (1-10)
• Confidence level
• Any biases at play?"
                className="min-h-[200px] resize-none"
              />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Key Lessons</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={lessons}
                onChange={(e) => setLessons(e.target.value)}
                placeholder="What did you learn from this trade?

• What worked well?
• Market insights gained
• Strategy refinements
• Personal growth
• Future applications"
                className="min-h-[200px] resize-none"
              />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Mistakes & Improvements</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={mistakes}
                onChange={(e) => setMistakes(e.target.value)}
                placeholder="What could you have done better?

• Entry timing issues
• Exit mistakes
• Risk management errors
• Emotional decisions
• Plan deviations
• Next time improvements"
                className="min-h-[200px] resize-none"
              />
            </CardContent>
          </Card>
        </div>

        {/* Save Button */}
        <div className="mt-8 text-center">
          <Button 
            onClick={handleSave} 
            disabled={updateTradeMutation.isPending}
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 px-8"
          >
            <Save className="w-5 h-5 mr-2" />
            {updateTradeMutation.isPending ? 'Saving Analysis...' : 'Save Complete Analysis'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TradeNotes;