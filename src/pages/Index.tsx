
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Brain, Target, TrendingUp, Shield, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  const navigate = useNavigate();
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);

  const modules = [
    {
      id: 'bias-check',
      title: 'Bias Check',
      subtitle: 'Pre-Market Assessment',
      description: '5-minute self-assessment before the bell rings',
      icon: Target,
      color: 'from-blue-500 to-blue-600',
      features: ['Sleep & mood analysis', 'News impact assessment', 'Risk recommendations', 'Focus mantras']
    },
    {
      id: 'auto-journal',
      title: 'Auto-Journal',
      subtitle: 'Post-Market Analysis',
      description: 'Upload trades and get instant AI insights',
      icon: BarChart3,
      color: 'from-green-500 to-green-600',
      features: ['CSV trade upload', 'Performance metrics', 'Pattern recognition', 'Improvement tips']
    },
    {
      id: 'mindset-mirror',
      title: 'Mindset Mirror',
      subtitle: 'Emotional Intelligence',
      description: '30-second voice notes for psychological insights',
      icon: Brain,
      color: 'from-purple-500 to-purple-600',
      features: ['Voice recording', 'Emotion tracking', 'Bias detection', 'Confidence analysis']
    }
  ];

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
                <h1 className="text-2xl font-bold text-slate-800">Trader Insight 360</h1>
                <p className="text-sm text-slate-600">Your AI Trading Coach</p>
              </div>
            </div>
            <Button 
              onClick={() => navigate('/dashboard')}
              className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <Badge variant="secondary" className="mb-6 bg-blue-100 text-blue-700 border-blue-200">
            <Shield className="w-4 h-4 mr-2" />
            Stop Self-Sabotaging Your Trades
          </Badge>
          <h2 className="text-5xl font-bold text-slate-900 mb-6 leading-tight">
            The All-in-One <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-500">Micro-Coach</span> for Day Traders
          </h2>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed">
            Spot self-sabotaging patterns, understand your emotions, and tighten risk discipline — 
            in just a few clicks each day. Built for intraday and scalping traders who want to level up their psychology.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => navigate('/dashboard')}
              className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 px-8 py-3 text-lg"
            >
              <Zap className="w-5 h-5 mr-2" />
              Start Your Journey
            </Button>
            <Button size="lg" variant="outline" className="border-slate-300 hover:bg-slate-50 px-8 py-3 text-lg">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Modules Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-slate-900 mb-4">Three Seamless Workflows</h3>
          <p className="text-lg text-slate-600">Designed to fit perfectly into your trading routine</p>
        </div>
        
        <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {modules.map((module) => {
            const IconComponent = module.icon;
            return (
              <Card 
                key={module.id}
                className={`cursor-pointer transition-all duration-300 hover:shadow-xl border-0 ${
                  hoveredModule === module.id ? 'scale-105 shadow-2xl' : 'shadow-lg'
                }`}
                onMouseEnter={() => setHoveredModule(module.id)}
                onMouseLeave={() => setHoveredModule(null)}
                onClick={() => navigate(`/${module.id}`)}
              >
                <CardHeader className="pb-4">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${module.color} flex items-center justify-center mb-4 mx-auto`}>
                    <IconComponent className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-xl text-center text-slate-800">{module.title}</CardTitle>
                  <CardDescription className="text-center text-slate-600 font-medium">
                    {module.subtitle}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600 text-center mb-6 leading-relaxed">
                    {module.description}
                  </p>
                  <div className="space-y-2">
                    {module.features.map((feature, index) => (
                      <div key={index} className="flex items-center text-sm text-slate-600">
                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-green-400 mr-3 flex-shrink-0" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-slate-900 mb-4">Why Trader Insight 360?</h3>
            <p className="text-lg text-slate-600">Because trading psychology makes or breaks your P&L</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {[
              { icon: Target, title: "Stop Revenge Trading", desc: "Catch emotional patterns before they destroy your account" },
              { icon: Shield, title: "Risk Management", desc: "AI-recommended position sizes based on your mental state" },
              { icon: Brain, title: "Emotional Intelligence", desc: "Understand your psychological triggers and biases" },
              { icon: TrendingUp, title: "Data-Driven Growth", desc: "Track improvement with metrics that actually matter" }
            ].map((benefit, index) => {
              const IconComponent = benefit.icon;
              return (
                <div key={index} className="text-center">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-blue-100 to-green-100 flex items-center justify-center mx-auto mb-4">
                    <IconComponent className="w-7 h-7 text-blue-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-800 mb-2">{benefit.title}</h4>
                  <p className="text-slate-600 text-sm leading-relaxed">{benefit.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-green-500 py-16">
        <div className="container mx-auto px-4 text-center">
          <h3 className="text-3xl font-bold text-white mb-4">Ready to Transform Your Trading?</h3>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of traders who've already improved their consistency and profitability
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate('/dashboard')}
            className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 text-lg font-semibold"
          >
            Start Free Today
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-green-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold">Trader Insight 360</span>
          </div>
          <p className="text-slate-400">© 2024 Trader Insight 360. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
