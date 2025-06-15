
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Target, Moon, Heart, Newspaper, DollarSign, ArrowLeft, CheckCircle, AlertTriangle, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BiasCheck = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    sleep: [7],
    mood: 'neutral',
    newsImpact: 'none',
    yesterdayPnL: ''
  });
  const [isCompleted, setIsCompleted] = useState(false);
  const [results, setResults] = useState({
    riskLevel: 'medium',
    recommendedRisk: '$75',
    mantra: 'Stay disciplined, trust your process',
    cautionLevel: 'yellow'
  });

  const moodEmojis = {
    terrible: '😞',
    poor: '😕',
    neutral: '😐',
    good: '🙂',
    excellent: '😊'
  };

  const handleSubmit = () => {
    // Simple logic for demo purposes
    const sleepScore = formData.sleep[0];
    const pnl = parseFloat(formData.yesterdayPnL) || 0;
    
    let cautionLevel = 'green';
    let recommendedRisk = '$100';
    let mantra = 'Stay disciplined, trust your process';
    
    if (sleepScore < 6 || formData.mood === 'terrible' || formData.mood === 'poor' || pnl < -200) {
      cautionLevel = 'red';
      recommendedRisk = '$25';
      mantra = 'Size down today, focus on quality over quantity';
    } else if (sleepScore < 7 || formData.newsImpact === 'high' || pnl < -50) {
      cautionLevel = 'yellow';
      recommendedRisk = '$50';
      mantra = 'Stay patient, let the setups come to you';
    }
    
    setResults({
      riskLevel: cautionLevel,
      recommendedRisk,
      mantra,
      cautionLevel
    });
    setIsCompleted(true);
  };

  if (isCompleted) {
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
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">Bias Check Complete</h1>
                  <p className="text-sm text-slate-600">Your pre-market assessment results</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Results Summary */}
          <Card className="mb-8 border-0 shadow-lg">
            <CardContent className="pt-8">
              <div className="text-center mb-8">
                <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
                  results.cautionLevel === 'green' ? 'bg-green-100' : 
                  results.cautionLevel === 'yellow' ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  {results.cautionLevel === 'green' ? (
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  ) : results.cautionLevel === 'yellow' ? (
                    <AlertTriangle className="w-10 h-10 text-yellow-600" />
                  ) : (
                    <Shield className="w-10 h-10 text-red-600" />
                  )}
                </div>
                
                <Badge 
                  variant={results.cautionLevel === 'green' ? 'default' : 'secondary'}
                  className={`text-lg px-4 py-2 mb-4 ${
                    results.cautionLevel === 'green' ? 'bg-green-100 text-green-800' :
                    results.cautionLevel === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}
                >
                  {results.cautionLevel === 'green' ? 'All Systems Go' :
                   results.cautionLevel === 'yellow' ? 'Trade with Caution' :
                   'High Risk - Size Down'}
                </Badge>
                
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Today's Trading Readiness</h2>
                <p className="text-slate-600">Based on your current mental and physical state</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card className="border border-slate-200">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <span>Recommended Risk</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-slate-800 mb-2">{results.recommendedRisk}</div>
                    <p className="text-sm text-slate-600">Per trade today</p>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <Heart className="w-5 h-5 text-purple-600" />
                      <span>Focus Mantra</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-medium text-slate-800 italic">"{results.mantra}"</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Action Items */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Today's Action Items</CardTitle>
              <CardDescription>Specific recommendations based on your assessment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {results.cautionLevel === 'red' && (
                  <>
                    <div className="flex items-start space-x-3 p-3 bg-red-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-red-900">Reduce Position Sizes</p>
                        <p className="text-sm text-red-700">Consider trading with 25% of your normal size today</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3 p-3 bg-red-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-red-900">Focus on High-Probability Setups</p>
                        <p className="text-sm text-red-700">Only take your A+ setups, skip marginal trades</p>
                      </div>
                    </div>
                  </>
                )}
                
                {results.cautionLevel === 'yellow' && (
                  <>
                    <div className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-yellow-900">Moderate Risk Taking</p>
                        <p className="text-sm text-yellow-700">Trade with 50% of normal size, be extra selective</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-yellow-900">Extra Attention to Stops</p>
                        <p className="text-sm text-yellow-700">Set tight stops and stick to them religiously</p>
                      </div>
                    </div>
                  </>
                )}

                {results.cautionLevel === 'green' && (
                  <>
                    <div className="flex items-start space-x-3 p-3 bg-green-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-green-900">Normal Risk Parameters</p>
                        <p className="text-sm text-green-700">You're in good shape to trade at full size</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3 p-3 bg-green-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-green-900">Trust Your Process</p>
                        <p className="text-sm text-green-700">Conditions are good for executing your strategy</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex space-x-4">
            <Button 
              onClick={() => navigate('/dashboard')}
              className="flex-1 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
            >
              Back to Dashboard
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setIsCompleted(false)}
              className="border-slate-300"
            >
              Retake Assessment
            </Button>
          </div>
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
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Bias Check</h1>
                <p className="text-sm text-slate-600">Pre-market mental assessment</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">How are you feeling today?</CardTitle>
            <CardDescription>
              A quick 5-minute assessment to optimize your trading performance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Sleep Quality */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Moon className="w-5 h-5 text-blue-600" />
                <Label className="text-lg font-medium">Sleep Quality (hours)</Label>
              </div>
              <div className="space-y-2">
                <Slider
                  value={formData.sleep}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, sleep: value }))}
                  max={12}
                  min={3}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-slate-600">
                  <span>3h</span>
                  <span className="font-medium">{formData.sleep[0]}h</span>
                  <span>12h</span>
                </div>
              </div>
            </div>

            {/* Current Mood */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Heart className="w-5 h-5 text-purple-600" />
                <Label className="text-lg font-medium">Current Mood</Label>
              </div>
              <RadioGroup 
                value={formData.mood} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, mood: value }))}
                className="grid grid-cols-5 gap-4"
              >
                {Object.entries(moodEmojis).map(([mood, emoji]) => (
                  <div key={mood} className="flex flex-col items-center space-y-2">
                    <Label htmlFor={mood} className="text-3xl cursor-pointer hover:scale-110 transition-transform">
                      {emoji}
                    </Label>
                    <RadioGroupItem value={mood} id={mood} className="sr-only" />
                    <Label htmlFor={mood} className="text-sm text-slate-600 cursor-pointer capitalize">
                      {mood}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* News Impact */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Newspaper className="w-5 h-5 text-green-600" />
                <Label className="text-lg font-medium">Expected News Impact</Label>
              </div>
              <RadioGroup 
                value={formData.newsImpact} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, newsImpact: value }))}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="none" />
                  <Label htmlFor="none" className="cursor-pointer">None - Regular trading day</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="medium" id="medium" />
                  <Label htmlFor="medium" className="cursor-pointer">Medium - Some earnings or data releases</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="high" id="high" />
                  <Label htmlFor="high" className="cursor-pointer">High - Major news, FOMC, or high-impact events</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Yesterday's P&L */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <DollarSign className="w-5 h-5 text-yellow-600" />
                <Label className="text-lg font-medium">Yesterday's P&L ($)</Label>
              </div>
              <Input
                type="number"
                placeholder="Enter your P&L from yesterday (e.g., -150 or +250)"
                value={formData.yesterdayPnL}
                onChange={(e) => setFormData(prev => ({ ...prev, yesterdayPnL: e.target.value }))}
                className="w-full"
              />
            </div>

            <Button 
              onClick={handleSubmit}
              className="w-full bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-lg py-6"
              disabled={!formData.yesterdayPnL}
            >
              Get My Trading Readiness
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BiasCheck;
