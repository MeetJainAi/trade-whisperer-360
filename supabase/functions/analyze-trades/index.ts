import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { trades } = await req.json();

        if (!trades || !Array.isArray(trades) || trades.length === 0) {
            return new Response(JSON.stringify({ error: 'Trades data is required and should be a non-empty array.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const tradesForAnalysis = trades.slice(0, 100);

        // Calculate basic metrics for context
        const totalPnL = tradesForAnalysis.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const winners = tradesForAnalysis.filter(t => (t.pnl || 0) > 0);
        const losers = tradesForAnalysis.filter(t => (t.pnl || 0) < 0);
        const winRate = tradesForAnalysis.length > 0 ? (winners.length / tradesForAnalysis.length) * 100 : 0;

        // Group trades by hour to analyze time patterns
        const hourlyData = {};
        tradesForAnalysis.forEach(trade => {
            if (trade.datetime) {
                const hour = new Date(trade.datetime).getHours();
                if (!hourlyData[hour]) hourlyData[hour] = [];
                hourlyData[hour].push(trade.pnl || 0);
            }
        });

        // Group trades by symbol for instrument analysis
        const symbolData = {};
        tradesForAnalysis.forEach(trade => {
            const symbol = trade.symbol || 'UNKNOWN';
            if (!symbolData[symbol]) symbolData[symbol] = [];
            symbolData[symbol].push(trade.pnl || 0);
        });

        const prompt = `
You are a professional trading psychology coach and performance analyst. Analyze this trader's performance data.

TRADING PERFORMANCE SUMMARY:
- Total Trades: ${tradesForAnalysis.length}
- Total P&L: $${totalPnL.toFixed(2)}
- Win Rate: ${winRate.toFixed(1)}%
- Winners: ${winners.length}, Losers: ${losers.length}

TRADE SAMPLE DATA (up to 100 trades):
${JSON.stringify(tradesForAnalysis.slice(0, 20), (key, value) => (key === 'id' || key === 'user_id' || key === 'session_id' || key === 'created_at') ? undefined : value, 2)}

HOURLY PERFORMANCE DATA:
${JSON.stringify(hourlyData, null, 2)}

SYMBOL PERFORMANCE DATA:
${JSON.stringify(symbolData, null, 2)}

As a trading coach, provide analysis focusing on:
1. Psychological patterns and biases
2. Risk management behaviors
3. Performance consistency
4. Time-of-day patterns
5. Instrument selection patterns

Respond with ONLY a valid JSON object with this exact structure:
{
  "ai_strengths": ["strength1", "strength2", "strength3"],
  "ai_mistakes": ["mistake1", "mistake2", "mistake3"],
  "ai_fixes": ["fix1", "fix2", "fix3"],
  "ai_key_insight": "comprehensive_insight"
}

Guidelines:
- ai_strengths: Identify 2-3 specific positive patterns or behaviors
- ai_mistakes: Identify 2-3 specific recurring problems or psychological biases
- ai_fixes: Suggest 3 concrete, actionable improvements
- ai_key_insight: One comprehensive insight about their trading psychology or biggest opportunity

Focus on psychological aspects like:
- Revenge trading after losses
- Overconfidence after wins
- Position sizing discipline
- Time management
- Emotional control
- Risk-reward ratios
- Consistency patterns
- Entry/exit timing

Be specific and actionable in your recommendations.
`;

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    response_mime_type: "application/json",
                    temperature: 0.7,
                    max_output_tokens: 1000
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Gemini API error in analyze-trades: ${response.status} ${errorText}`);
            throw new Error(`AI analysis failed due to an API error.`);
        }

        const geminiResponse = await response.json();
        
        if (!geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
          console.error('Unexpected Gemini response format in analyze-trades:', geminiResponse);
          throw new Error('Failed to parse insights from AI due to unexpected response format.');
        }

        const insightsText = geminiResponse.candidates[0].content.parts[0].text;
        
        let insights;
        try {
            insights = JSON.parse(insightsText);
        } catch (parseError) {
            console.error('Failed to parse AI response as JSON:', insightsText);
            throw new Error('AI analysis result could not be parsed.');
        }
        
        if (!insights.ai_strengths || !insights.ai_mistakes || !insights.ai_fixes || !insights.ai_key_insight) {
            console.error('Parsed insights object is missing required keys:', insights);
            throw new Error('AI analysis result is incomplete.');
        }

        // Ensure arrays are properly formatted
        insights.ai_strengths = Array.isArray(insights.ai_strengths) ? insights.ai_strengths : [insights.ai_strengths];
        insights.ai_mistakes = Array.isArray(insights.ai_mistakes) ? insights.ai_mistakes : [insights.ai_mistakes];
        insights.ai_fixes = Array.isArray(insights.ai_fixes) ? insights.ai_fixes : [insights.ai_fixes];

        return new Response(JSON.stringify(insights), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Error in analyze-trades function:', error);
        const message = error.message.includes('API') || error.message.includes('AI') ? error.message : 'An internal error occurred during trade analysis.';
        return new Response(JSON.stringify({ error: message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});