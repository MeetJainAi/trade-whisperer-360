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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Tables } from '@/integrations/supabase/types';
import { ArrowLeft, Save, Calendar, DollarSign, TrendingUp, TrendingDown, Brain, Target, AlertCircle, CheckCircle, Image, PlusCircle, Link2, FileText, Lightbulb, Star, Plus, X, Settings, BookOpen, Sparkles, Link } from 'lucide-react';
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
  const [strategyOptions, setStrategyOptions] = useState<string[]>([]);
  const [newStrategyOption, setNewStrategyOption] = useState('');
  const [emotions, setEmotions] = useState('');
  const [lessons, setLessons] = useState('');
  const [mistakes, setMistakes] = useState(''); 
  const [imageUrl, setImageUrl] = useState('');
  const [customFields, setCustomFields] = useState<{[key: string]: string}>({});
  const [newFieldName, setNewFieldName] = useState('');
  const [savedOptions, setSavedOptions] = useState<{[key: string]: string[]}>({
    reasoning: [],
    emotions: [],
    lessons: [],
    mistakes: [],
    strategy: []
  });
  const [newCustomOption, setNewCustomOption] = useState<{[key: string]: string}>({
    reasoning: '',
    emotions: '',
    lessons: '',
    mistakes: '',
    strategy: ''
  });
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [playbookId, setPlaybookId] = useState<string>('');
  const [tradingViewLink, setTradingViewLink] = useState('');
  
  // Custom field options
  const [customOptions, setCustomOptions] = useState<{[key: string]: string[]}>({});
  const [showCustomInputs, setShowCustomInputs] = useState<{[key: string]: boolean}>({});

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

  // Fetch playbooks
  const { data: playbooks } = useQuery({
    queryKey: ['playbooks', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('trading_playbooks')
        .select('id, name, strategy_type')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch custom field options
  const { data: fieldOptions } = useQuery({
    queryKey: ['custom_field_options', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('custom_field_options')
        .select('*')
        .eq('user_id', user.id)
        .order('usage_count', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Group custom options by field
  useEffect(() => {
    if (fieldOptions) {
      const grouped = fieldOptions.reduce((acc, option) => {
        if (!acc[option.field_name]) acc[option.field_name] = [];
        acc[option.field_name].push(option.option_value);
        return acc;
      }, {} as {[key: string]: string[]});
      setCustomOptions(grouped);
    }
  }, [fieldOptions]);

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
      setPlaybookId((trade as any).playbook_id || '');
      
      // Parse detailed notes if they exist
      try {
        if (trade.notes) {
          const detailedNotes = JSON.parse(trade.notes);
          if (typeof detailedNotes === 'object') {
            setReasoning(detailedNotes.reasoning || '');
            setEmotions(detailedNotes.emotions || '');
            setLessons(detailedNotes.lessons || '');
            setMistakes(detailedNotes.mistakes || ''); 
            setTradingViewLink(detailedNotes.tradingViewLink || '');
            
            // Load custom fields if they exist
            if (detailedNotes.customFields) {
              setCustomFields(detailedNotes.customFields);
            }
            
            // Load saved custom options if they exist
            if (detailedNotes.savedOptions) {
              setSavedOptions(detailedNotes.savedOptions);
            }
            
            // Load strategy options if they exist
            if (detailedNotes.strategyOptions) {
              setStrategyOptions(detailedNotes.strategyOptions);
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
      tradingViewLink,
      customFields,
      savedOptions,
      strategyOptions,
      lastUpdated: new Date().toISOString()
    };

    updateTradeMutation.mutate({
      notes: JSON.stringify(detailedNotes),
      strategy,
      tags, 
      image_url: imageUrl,
      playbook_id: playbookId || null,
    } as any);
  };

  const addCustomOption = async (fieldName: string, value: string) => {
    if (!user || !value.trim()) return;
    
    try {
      await supabase.rpc('increment_custom_option_usage', {
        p_user_id: user.id,
        p_field_name: fieldName,
        p_option_value: value.trim()
      });
      
      // Update local state
      setCustomOptions(prev => ({
        ...prev,
        [fieldName]: [...(prev[fieldName] || []), value.trim()]
      }));
      
      queryClient.invalidateQueries({ queryKey: ['custom_field_options', user.id] });
    } catch (error) {
      console.error('Error adding custom option:', error);
    }
  };

  const applyCustomOption = (fieldName: string, value: string) => {
    switch (fieldName) {
      case 'reasoning':
        setReasoning(prev => prev ? `${prev}\n\n${value}` : value);
        break;
      case 'emotions':
        setEmotions(prev => prev ? `${prev}\n\n${value}` : value);
        break;
      case 'lessons':
        setLessons(prev => prev ? `${prev}\n\n${value}` : value);
        break;
      case 'mistakes':
        setMistakes(prev => prev ? `${prev}\n\n${value}` : value);
        break;
    }
    
    // Increment usage count
    if (user) {
      addCustomOption(fieldName, value);
    }
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

  // Load saved options from localStorage on component mount
  useEffect(() => {
    try {
      // Load saved options
      const savedOptionsFromStorage = localStorage.getItem('traderInsight_savedOptions');
      if (savedOptionsFromStorage) {
        const parsedOptions = JSON.parse(savedOptionsFromStorage);
        setSavedOptions(prevOptions => ({
          ...prevOptions,
          ...parsedOptions
        }));
      }
      
      // Load strategy options
      const strategyOptionsFromStorage = localStorage.getItem('traderInsight_strategyOptions');
      if (strategyOptionsFromStorage) {
        const parsedStrategyOptions = JSON.parse(strategyOptionsFromStorage);
        setStrategyOptions(parsedStrategyOptions);
      }
    } catch (error) {
      console.error('Error loading saved options:', error);
    }
  }, []);

  // Save custom option to both state and localStorage
  const saveCustomOption = (field: string) => {
    if (!newCustomOption[field] || newCustomOption[field].trim() === '') return;
    
    const option = newCustomOption[field].trim();
    
    // Update state
    const updatedOptions = {
      ...savedOptions,
      [field]: [...(savedOptions[field] || []), option]
    };
    
    setSavedOptions(updatedOptions);
    
    // Reset input
    setNewCustomOption({
      ...newCustomOption,
      [field]: ''
    });
    
    // Save to localStorage
    try {
      localStorage.setItem('traderInsight_savedOptions', JSON.stringify(updatedOptions));
    } catch (error) {
      console.error('Error saving options to localStorage:', error);
    }
    
    toast({
      title: "Custom option saved",
      description: `"${option}" added to your quick options.`,
    });
  };

  // Remove a saved custom option
  const removeCustomOption = (field: string, option: string) => {
    const updatedOptions = {
      ...savedOptions,
      [field]: savedOptions[field].filter(item => item !== option)
    };
    
    setSavedOptions(updatedOptions);
    
    // Update localStorage
    try {
      localStorage.setItem('traderInsight_savedOptions', JSON.stringify(updatedOptions));
    } catch (error) {
      console.error('Error saving options to localStorage:', error);
    }
  };

  // Save strategy option
  const saveStrategyOption = () => {
    if (!newStrategyOption || newStrategyOption.trim() === '') return;
    
    const option = newStrategyOption.trim();
    
    // Update state
    const updatedOptions = [...strategyOptions, option];
    setStrategyOptions(updatedOptions);
    
    // Reset input
    setNewStrategyOption('');
    
    // Save to localStorage
    try {
      localStorage.setItem('traderInsight_strategyOptions', JSON.stringify(updatedOptions));
    } catch (error) {
      console.error('Error saving strategy options to localStorage:', error);
    }
    
    toast({
      title: "Strategy option saved",
      description: `"${option}" added to your strategy options.`,
    });
  };

  // Remove a strategy option
  const removeStrategyOption = (option: string) => {
    const updatedOptions = strategyOptions.filter(item => item !== option);
    setStrategyOptions(updatedOptions);
    
    // Update localStorage
    try {
      localStorage.setItem('traderInsight_strategyOptions', JSON.stringify(updatedOptions));
    } catch (error) {
      console.error('Error saving strategy options to localStorage:', error);
    }
  };

  // Add option text to the corresponding field
  const addOptionToField = (field: string, option: string) => {
    const setterFunctions = {
      reasoning: setReasoning,
      emotions: setEmotions,
      lessons: setLessons,
      mistakes: setMistakes,
      strategy: setStrategy
    };
    
    const currentValue = {
      reasoning,
      emotions,
      lessons,
      mistakes,
      strategy
    }[field];
    
    setterFunctions[field](currentValue ? `${currentValue}\n• ${option}` : `• ${option}`);
  };

  // Predefined tags for quick selection
  const quickTags = {
    quality: ['excellent', 'good', 'average', 'poor'],
    execution: ['patient-entry', 'good-exit', 'followed-plan', 'emotional', 'rushed', 'disciplined'],
    psychology: ['confident', 'fearful', 'greedy', 'revenge-trading', 'overtrading', 'fomo', 'patient'],
    setup: ['breakout', 'pullback', 'reversal', 'trend-following', 'scalp', 'swing']
  };

  // Predefined strategy options
  const predefinedStrategyOptions = [
    'Breakout',
    'Pullback',
    'Trend Following',
    'Mean Reversion',
    'Gap Fill',
    'Momentum',
    'Scalping',
    'Swing Trading',
    'VWAP Bounce',
    'Support/Resistance',
    'Double Bottom/Top',
    'Flag Pattern',
    'Moving Average Crossover'
  ];

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
                  <div className="space-y-2">
                    <Select value={strategy} onValueChange={setStrategy}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select or type strategy..." />
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
                    <Input
                      placeholder="Or type custom strategy..."
                      value={strategy}
                      onChange={(e) => setStrategy(e.target.value)}
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Playbook Used</label>
                  <Select value={playbookId} onValueChange={setPlaybookId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select playbook (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No Playbook</SelectItem>
                      {playbooks?.map((playbook) => (
                        <SelectItem key={playbook.id} value={playbook.id}>
                          <div className="flex items-center space-x-2">
                            <BookOpen className="w-4 h-4" />
                            <span>{playbook.name}</span>
                            {playbook.strategy_type && (
                              <Badge variant="outline" className="text-xs">
                                {playbook.strategy_type}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/playbooks')}
                      className="text-purple-600 border-purple-300 hover:bg-purple-50"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create New Playbook
                    </Button>
                  </div>
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

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>TradingView Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">TradingView Screenshot Link</label>
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Paste TradingView screenshot URL..."
                      value={tradingViewLink}
                      onChange={(e) => setTradingViewLink(e.target.value)}
                    />
                    <Button variant="outline" size="icon">
                      <Link className="w-4 h-4" />
                    </Button>
                  </div>
                  {tradingViewLink && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center space-x-2 text-sm text-slate-600">
                        <Image className="w-4 h-4" />
                        <span>Chart link saved</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Detailed Analysis with Custom Options */}
        <div className="grid lg:grid-cols-2 gap-6">
          {[
            { key: 'reasoning', title: 'Trade Reasoning', placeholder: 'Why did you take this trade? What was your thesis?\n\n• Technical setup\n• Market conditions\n• Catalyst or news\n• Risk/reward ratio\n• Confluence factors' },
            { key: 'emotions', title: 'Emotional State', placeholder: 'How were you feeling during this trade?\n\n• Pre-trade emotions\n• During the trade\n• After exit\n• Stress level (1-10)\n• Confidence level\n• Any biases at play?' },
            { key: 'lessons', title: 'Key Lessons & What Worked', placeholder: 'What did you learn from this trade?\n\n• What worked well?\n• Market insights gained\n• Strategy refinements\n• Personal growth\n• Future applications' },
            { key: 'mistakes', title: 'Mistakes & Improvements', placeholder: 'What could you have done better?\n\n• Entry timing issues\n• Exit mistakes\n• Risk management errors\n• Emotional decisions\n• Plan deviations\n• Next time improvements' }
          ].map(({ key, title, placeholder }) => (
            <Card key={key} className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{title}</CardTitle>
                  <div className="flex space-x-2">
                    {customOptions[key]?.length > 0 && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Sparkles className="w-4 h-4 mr-2" />
                            Quick Add
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Quick Add - {title}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {customOptions[key]?.map((option, index) => (
                              <Button
                                key={index}
                                variant="outline"
                                className="w-full text-left justify-start h-auto p-3"
                                onClick={() => applyCustomOption(key, option)}
                              >
                                <div className="text-sm">{option}</div>
                              </Button>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCustomInputs(prev => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {showCustomInputs[key] && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <div className="flex space-x-2">
                      <Input
                        placeholder={`Add custom ${title.toLowerCase()} option...`}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const value = (e.target as HTMLInputElement).value;
                            if (value.trim()) {
                              addCustomOption(key, value.trim());
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => setShowCustomInputs(prev => ({ ...prev, [key]: false }))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-blue-600 mt-2">
                      Press Enter to save this option for future use across all trades
                    </p>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <Textarea
                  value={
                    key === 'reasoning' ? reasoning :
                    key === 'emotions' ? emotions :
                    key === 'lessons' ? lessons :
                    mistakes
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    if (key === 'reasoning') setReasoning(value);
                    else if (key === 'emotions') setEmotions(value);
                    else if (key === 'lessons') setLessons(value);
                    else setMistakes(value);
                  }}
                  placeholder={placeholder}
                  className="min-h-[200px] resize-none"
                />
              </CardContent>
            </Card>
          ))}
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
          <p className="text-xs text-slate-500 mt-2">
            Your custom quick options are saved automatically and will be available for all trades
          </p>
        </div>
      </div>
    </div>
  );
};

export default TradeNotes;