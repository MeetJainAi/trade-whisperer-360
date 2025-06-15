
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, ArrowLeft, Mic, MicOff, Play, Square, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const MindsetMirror = () => {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Sample analysis data
  const analysisData = {
    transcript: "I'm feeling really frustrated right now. I just had three losing trades in a row and I can feel myself wanting to increase my position size to make back the money. I know this is exactly what I shouldn't do but it's so hard to fight this urge. My heart is racing and I feel like I need to get back to breakeven immediately.",
    primaryEmotion: "Frustration",
    confidenceLevel: "Low",
    detectedBias: "Loss Aversion",
    riskLevel: "High",
    emotionData: [
      { name: 'Frustration', value: 45, color: '#ef4444' },
      { name: 'Anxiety', value: 30, color: '#f97316' },
      { name: 'Urgency', value: 15, color: '#eab308' },
      { name: 'Confidence', value: 10, color: '#22c55e' }
    ]
  };

  const startRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    
    // Simulate recording timer
    const timer = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 30) {
          clearInterval(timer);
          setIsRecording(false);
          setHasRecording(true);
          return 30;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    setHasRecording(true);
  };

  const analyzeRecording = () => {
    // Simulate AI processing time
    setTimeout(() => {
      setShowAnalysis(true);
    }, 2000);
  };

  if (showAnalysis) {
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
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">Emotional Analysis</h1>
                  <p className="text-sm text-slate-600">AI-powered psychological insights</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Analysis Summary */}
          <div className="grid lg:grid-cols-3 gap-6 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                    <div className="text-2xl">😤</div>
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1">Primary Emotion</h3>
                  <p className="text-xl font-bold text-red-600">{analysisData.primaryEmotion}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-3">
                    <div className="text-2xl">⚠️</div>
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1">Confidence Level</h3>
                  <p className="text-xl font-bold text-yellow-600">{analysisData.confidenceLevel}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-3">
                    <div className="text-2xl">🧠</div>
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1">Detected Bias</h3>
                  <p className="text-xl font-bold text-orange-600">{analysisData.detectedBias}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transcript and Emotion Chart */}
          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Transcript</CardTitle>
                <CardDescription>Auto-transcribed from your voice note</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-50 rounded-lg p-4 text-slate-700 leading-relaxed">
                  "{analysisData.transcript}"
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                  <span>Emotion Breakdown</span>
                </CardTitle>
                <CardDescription>Detected emotional states from your voice note</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={analysisData.emotionData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}%`}
                    >
                      {analysisData.emotionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Psychological Insights */}
          <Card className="border-0 shadow-lg mb-8">
            <CardHeader>
              <CardTitle>Psychological Insights</CardTitle>
              <CardDescription>AI analysis of your emotional triggers and patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="p-4 bg-red-50 rounded-lg border-l-4 border-l-red-500">
                  <h4 className="font-semibold text-red-900 mb-2">Risk Alert: High Emotional Trading State</h4>
                  <p className="text-red-800 text-sm leading-relaxed">
                    Your frustration levels are elevated, which typically leads to poor decision-making. 
                    The urge to "get back to breakeven" is a classic sign of loss aversion bias. This emotional 
                    state often results in oversizing positions and taking unnecessary risks.
                  </p>
                </div>

                <div className="p-4 bg-yellow-50 rounded-lg border-l-4 border-l-yellow-500">
                  <h4 className="font-semibold text-yellow-900 mb-2">Pattern Recognition</h4>
                  <p className="text-yellow-800 text-sm leading-relaxed">
                    This is the third time this month you've recorded similar emotions after consecutive losses. 
                    Your nervous system appears to activate a fight-or-flight response, creating urgency around 
                    recovery rather than patience for quality setups.
                  </p>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-l-blue-500">
                  <h4 className="font-semibold text-blue-900 mb-2">Recommended Actions</h4>
                  <ul className="text-blue-800 text-sm space-y-1">
                    <li>• Take a 15-minute break before making any trading decisions</li>
                    <li>• Reduce position size by 50% for the next 3 trades</li>
                    <li>• Practice the 4-7-8 breathing technique to calm your nervous system</li>
                    <li>• Review your trading plan's rules around consecutive losses</li>
                    <li>• Consider stopping trading for today if emotions don't stabilize</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <Button 
              onClick={() => setShowAnalysis(false)}
              className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600"
            >
              Record Another Session
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/dashboard')}
              className="border-slate-300"
            >
              Back to Dashboard
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
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Mindset Mirror</h1>
                <p className="text-sm text-slate-600">Emotional intelligence for traders</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 flex items-center justify-center mx-auto mb-4">
              <Brain className="w-10 h-10 text-purple-600" />
            </div>
            <CardTitle className="text-2xl">How are you feeling right now?</CardTitle>
            <CardDescription className="max-w-2xl mx-auto">
              Record a 30-second voice note describing your current emotional state. 
              Our AI will analyze your tone, word choice, and patterns to provide insights.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-8">
              {/* Recording Interface */}
              <div className="flex flex-col items-center space-y-6">
                <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isRecording 
                    ? 'bg-red-500 shadow-lg shadow-red-200 animate-pulse' 
                    : hasRecording 
                      ? 'bg-green-500 shadow-lg shadow-green-200'
                      : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:shadow-lg shadow-purple-200'
                }`}>
                  {isRecording ? (
                    <MicOff className="w-12 h-12 text-white" />
                  ) : hasRecording ? (
                    <Play className="w-12 h-12 text-white" />
                  ) : (
                    <Mic className="w-12 h-12 text-white" />
                  )}
                </div>

                {isRecording && (
                  <div className="space-y-2">
                    <Badge variant="destructive" className="text-lg px-4 py-2">
                      Recording... {recordingTime}s
                    </Badge>
                    <p className="text-sm text-slate-600">
                      Speak naturally about how you're feeling
                    </p>
                  </div>
                )}

                {hasRecording && !isRecording && (
                  <div className="space-y-2">
                    <Badge variant="default" className="text-lg px-4 py-2 bg-green-100 text-green-800">
                      Recording Complete
                    </Badge>
                    <p className="text-sm text-slate-600">
                      Ready to analyze your emotional state
                    </p>
                  </div>
                )}

                {!isRecording && !hasRecording && (
                  <p className="text-slate-600">
                    Tap the microphone to start recording
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center space-x-4">
                {!isRecording && !hasRecording && (
                  <Button 
                    onClick={startRecording}
                    size="lg"
                    className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 px-8 py-3"
                  >
                    <Mic className="w-5 h-5 mr-2" />
                    Start Recording
                  </Button>
                )}

                {isRecording && (
                  <Button 
                    onClick={stopRecording}
                    size="lg"
                    variant="destructive"
                    className="px-8 py-3"
                  >
                    <Square className="w-5 h-5 mr-2" />
                    Stop Recording
                  </Button>
                )}

                {hasRecording && !isRecording && (
                  <div className="flex space-x-4">
                    <Button 
                      onClick={analyzeRecording}
                      size="lg"
                      className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 px-8 py-3"
                    >
                      Analyze Emotions
                    </Button>
                    <Button 
                      onClick={() => {
                        setHasRecording(false);
                        setRecordingTime(0);
                      }}
                      size="lg"
                      variant="outline"
                      className="px-8 py-3"
                    >
                      Record Again
                    </Button>
                  </div>
                )}
              </div>

              {/* Tips */}
              <div className="bg-slate-50 rounded-lg p-6 text-left">
                <h3 className="font-semibold text-slate-800 mb-3">Tips for Better Analysis:</h3>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>• Speak naturally and honestly about your current emotions</li>
                  <li>• Mention specific trading situations that triggered these feelings</li>
                  <li>• Include physical sensations (racing heart, tension, etc.)</li>
                  <li>• Talk about any urges or impulses you're experiencing</li>
                  <li>• Don't worry about perfect grammar - authenticity matters more</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MindsetMirror;
