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
import { ArrowLeft, Save, Calendar, DollarSign, TrendingUp, TrendingDown, Brain, Target, AlertCircle, CheckCircle, Image, PlusCircle, Link2, FileText, Lightbulb } from 'lucide-react';
import { format } from 'date-fns';

const TradeNotes = () => {
  const { tradeId } = useParams<{ tradeId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [strategy, setStrategy] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [emotions, setEmotions] = useState('');
  const [lessons, setLessons] = useState('');
  const [mistakes, setMistakes] = useState(''); 
  const [imageUrl, setImageUrl] = useState('');
  const [customFields, setCustomFields] = useState<{[key: string]: string}>({});
  const [newFieldName, setNewFieldName] = useState('');
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);

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
      setStrategy((trade as any).strategy || '');
      setTags((trade as any).tags || []);
      setImageUrl(trade.image_url || '');
      
      // Parse detailed notes if they exist
      try {
        if (trade.notes) {
          const detailedNotes = JSON.parse(trade.notes);
          if (typeof detailedNotes === 'object') {
            setReasoning(detailedNotes.reasoning || '');
            setEmotions(detailedNotes.emotions || '');
            setLessons(detailedNotes.lessons || '');
            setMistakes(detailedNotes.mistakes || ''); 
            
            // Load custom fields if they exist
            if (detailedNotes.customFields) {
              setCustomFields(detailedNotes.customFields);
            }
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
      customFields,
      lastUpdated: new Date().toISOString()
    };

    updateTradeMutation.mutate({
      notes: JSON.stringify(detailedNotes),
      strategy,
      tags, 
      image_url: imageUrl
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

  const addCustomField = () => {
    if (newFieldName.trim() && !customFields[newFieldName.trim()]) {
      setCustomFields({
        ...customFields,
        [newFieldName.trim()]: ''
      });
      setNewFieldName('');
    }
  };

  const updateCustomField = (key: string, value: string) => {
    setCustomFields({
      ...customFields,
      [key]: value
    });
  };

  const removeCustomField = (key: string) => {
    const newCustomFields = {...customFields};
    delete newCustomFields[key];
    setCustomFields(newCustomFields);
  };

  // Predefined tags for quick selection
  const quickTags = {
    quality: ['excellent', 'good', 'average', 'poor'],
    execution: ['patient-entry', 'good-exit', 'followed-plan', 'emotional', 'rushed', 'disciplined'],
    psychology: ['confident', 'fearful', 'greedy', 'revenge-trading', 'overtrading', 'fomo', 'patient'],
    setup: ['breakout', 'pullback', 'reversal', 'trend-following', 'scalp', 'swing']
  };

  const toggleQuickTag = (tag: string) => {
    if (tags.includes(tag)) {
      removeTag(tag);
    } else {
      setTags([...tags, tag]);
    }
  };

  // Predefined options for each field
  const predefinedOptions = {
    reasoning: [
      'Breakout above resistance',
      'Support bounce',
      'Trend continuation',
      'Reversal pattern',
      'Gap fill',
      'News catalyst',
      'Earnings reaction',
      'Technical pattern',
      'Volume spike',
      'Momentum play'
    ],
    emotions: [
      'Confident and calm',
      'Anxious about entry',
      'FOMO-driven',
      'Revenge trading after loss',
      'Hesitant to take profit',
      'Fearful of loss',
      'Excited and impulsive',
      'Disciplined and patient',
      'Frustrated with market',
      'Overconfident after wins'
    ],
    lessons: [
      'Patience pays off',
      'Stick to the plan',
      'Trust your analysis',
      'Size appropriately',
      'Cut losses quickly',
      'Let winners run',
      'Avoid trading news',
      'Wait for confirmation',
      'Focus on high probability setups',
      'Manage risk first'
    ],
    mistakes: [
      'Entered too early',
      'Exited too soon',
      'Position size too large',
      'Ignored stop loss',
      'Chased price',
      'Averaged down on loser',
      'Traded without a plan',
      'Emotional decision making',
      'Ignored market conditions',
      'Overtraded'
    ]
  };

  // AI suggestions (simulated)
  const aiSuggestions = {
    reasoning: "Based on your trading history with similar setups, you might want to consider mentioning the specific technical pattern you identified and the key levels that influenced your decision.",
    emotions: "Your past trades show a pattern of hesitation when taking profits. Consider reflecting on whether you felt any anxiety about closing this position too early.",
    lessons: "Your most profitable trades typically involve patient entries. Did this trade reinforce that pattern or challenge it?",
    mistakes: "Looking at your trading history, you often enter positions too early. Did you wait for confirmation on this trade or jump in prematurely?"
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
              <CardTitle>Strategy & Quick Classification</CardTitle>
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
                  <label className="block text-sm font-medium text-slate-700 mb-2">Custom Tags</label>
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
              <CardTitle>Quick Tag Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Trade Quality</h4>
                  <div className="flex space-x-2">
                    {quickTags.quality.map((quality) => (
                      <Badge 
                        key={quality}
                        variant={tags.includes(quality) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleQuickTag(quality)}
                      >
                        {quality.charAt(0).toUpperCase() + quality.slice(1)}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Execution</h4>
                  <div className="flex flex-wrap gap-2">
                    {quickTags.execution.map((exec) => (
                      <Badge 
                        key={exec}
                        variant={tags.includes(exec) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleQuickTag(exec)}
                      >
                        {exec.replace('-', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Psychology</h4>
                  <div className="flex flex-wrap gap-2">
                    {quickTags.psychology.map((psych) => (
                      <Badge 
                        key={psych}
                        variant={tags.includes(psych) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleQuickTag(psych)}
                      >
                        {psych.replace('-', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Setup Type</h4>
                  <div className="flex flex-wrap gap-2">
                    {quickTags.setup.map((setup) => (
                      <Badge 
                        key={setup}
                        variant={tags.includes(setup) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleQuickTag(setup)}
                      >
                        {setup.replace('-', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TradingView Screenshot */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Image className="w-5 h-5 text-blue-600" />
                <span>TradingView Screenshot</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Image URL</label>
                  <div className="flex space-x-2">
                    <Input
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Paste TradingView screenshot URL here"
                    />
                  </div>
                </div>
                
                {imageUrl && (
                  <div className="border rounded-lg overflow-hidden">
                    <img 
                      src={imageUrl} 
                      alt="Trade Screenshot" 
                      className="w-full h-auto"
                      onError={(e) => {
                        e.currentTarget.src = 'https://via.placeholder.com/800x400?text=Invalid+Image+URL';
                      }}
                    />
                  </div>
                )}
                
                <div className="text-sm text-slate-600">
                  <p className="flex items-center">
                    <Link2 className="w-4 h-4 mr-1" />
                    Tip: Take a screenshot in TradingView, click "Save Image", then copy the URL
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Analysis */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="w-5 h-5 text-blue-600" />
                <span>Trade Reasoning</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="ml-auto text-xs"
                  onClick={() => setShowAiSuggestions(!showAiSuggestions)}
                >
                  <Lightbulb className="w-3 h-3 mr-1" />
                  AI Help
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showAiSuggestions && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
                  <div className="flex items-start">
                    <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
                    <p>{aiSuggestions.reasoning}</p>
                  </div>
                </div>
              )}
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Quick Options</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {predefinedOptions.reasoning.map((option, index) => (
                    <Badge 
                      key={index}
                      variant="outline"
                      className="cursor-pointer hover:bg-blue-50"
                      onClick={() => setReasoning(reasoning ? `${reasoning}\n• ${option}` : `• ${option}`)}
                    >
                      + {option}
                    </Badge>
                  ))}
                </div>
              </div>
              
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
              <CardTitle className="flex items-center space-x-2">
                <Brain className="w-5 h-5 text-purple-600" />
                <span>Emotional State & Psychology</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="ml-auto text-xs"
                  onClick={() => setShowAiSuggestions(!showAiSuggestions)}
                >
                  <Lightbulb className="w-3 h-3 mr-1" />
                  AI Help
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showAiSuggestions && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
                  <div className="flex items-start">
                    <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
                    <p>{aiSuggestions.emotions}</p>
                  </div>
                </div>
              )}
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Quick Options</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {predefinedOptions.emotions.map((option, index) => (
                    <Badge 
                      key={index}
                      variant="outline"
                      className="cursor-pointer hover:bg-purple-50"
                      onClick={() => setEmotions(emotions ? `${emotions}\n• ${option}` : `• ${option}`)}
                    >
                      + {option}
                    </Badge>
                  ))}
                </div>
              </div>
              
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
              <CardTitle className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span>Key Lessons & What Worked</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="ml-auto text-xs"
                  onClick={() => setShowAiSuggestions(!showAiSuggestions)}
                >
                  <Lightbulb className="w-3 h-3 mr-1" />
                  AI Help
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showAiSuggestions && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
                  <div className="flex items-start">
                    <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
                    <p>{aiSuggestions.lessons}</p>
                  </div>
                </div>
              )}
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Quick Options</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {predefinedOptions.lessons.map((option, index) => (
                    <Badge 
                      key={index}
                      variant="outline"
                      className="cursor-pointer hover:bg-green-50"
                      onClick={() => setLessons(lessons ? `${lessons}\n• ${option}` : `• ${option}`)}
                    >
                      + {option}
                    </Badge>
                  ))}
                </div>
              </div>
              
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
              <CardTitle className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span>Mistakes & Areas for Improvement</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="ml-auto text-xs"
                  onClick={() => setShowAiSuggestions(!showAiSuggestions)}
                >
                  <Lightbulb className="w-3 h-3 mr-1" />
                  AI Help
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showAiSuggestions && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
                  <div className="flex items-start">
                    <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
                    <p>{aiSuggestions.mistakes}</p>
                  </div>
                </div>
              )}
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Quick Options</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {predefinedOptions.mistakes.map((option, index) => (
                    <Badge 
                      key={index}
                      variant="outline"
                      className="cursor-pointer hover:bg-red-50"
                      onClick={() => setMistakes(mistakes ? `${mistakes}\n• ${option}` : `• ${option}`)}
                    >
                      + {option}
                    </Badge>
                  ))}
                </div>
              </div>
              
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

        {/* Custom Fields Section */}
        <Card className="border-0 shadow-lg mb-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span>Custom Fields</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Existing Custom Fields */}
              {Object.keys(customFields).length > 0 && (
                <div className="space-y-4">
                  {Object.entries(customFields).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-4 items-start">
                      <div className="text-sm font-medium text-slate-700">{key}</div>
                      <Textarea
                        value={value}
                        onChange={(e) => updateCustomField(key, e.target.value)}
                        placeholder={`Enter ${key} details...`}
                        className="min-h-[100px] resize-none"
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => removeCustomField(key)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add New Custom Field */}
              <div className="pt-4 border-t">
                <h4 className="font-medium text-slate-800 mb-3">Add Custom Field</h4>
                <div className="flex space-x-2">
                  <Input
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="Enter field name..."
                    className="flex-1"
                  />
                  <Button 
                    onClick={addCustomField}
                    disabled={!newFieldName.trim()}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Add Field
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Create custom fields to track specific aspects of your trades (e.g., "Market Conditions", "Risk/Reward Ratio", "Trade Setup")
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button - Sticky at bottom */}
        <div className="sticky bottom-4 text-center bg-white/90 backdrop-blur-sm p-4 rounded-lg border shadow-lg">
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