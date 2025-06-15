
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

// This is a mock implementation.
// In a real-world scenario, you would call an AI service like OpenAI here.
function generateInsights(trades: any[]) {
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);

  const strengths = [];
  if (winningTrades.length > losingTrades.length) {
    strengths.push('Excellent win/loss ratio. You are selective with your trades.');
    strengths.push('Strong performance in the morning session.');
  } else {
    strengths.push('You are good at cutting losses quickly.');
  }

  const mistakes = [];
  if (losingTrades.length > 0) {
    mistakes.push('Tendency to overtrade during midday chop.');
    mistakes.push('Holding onto losing trades for too long.');
  } else {
    mistakes.push('You seem to be avoiding risky setups, which is good.');
  }

  const fixes = [];
  fixes.push('Implement a hard stop for the number of trades per day.');
  fixes.push('Take a 15-minute break after two consecutive losses.');
  fixes.push('Review your pre-trade checklist for every setup.');
  
  const keyInsight = 'Your data suggests a strong edge in trend-following strategies during the first two hours of the market open. Focusing your capital during this period could yield better results.';

  return {
    ai_strengths: strengths,
    ai_mistakes: mistakes,
    ai_fixes: fixes,
    ai_key_insight: keyInsight,
  };
}


serve(async (req) => {
  // This is needed to invoke the function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    } })
  }

  try {
    const { trades } = await req.json();

    if (!trades || !Array.isArray(trades)) {
        return new Response(JSON.stringify({ error: 'Trades data is required and should be an array.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const insights = generateInsights(trades);

    return new Response(JSON.stringify(insights), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
       },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 500,
    });
  }
})
