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
        const { playbookData, userTrades, action } = await req.json();

        let prompt = '';
        
        if (action === 'create_playbook') {
            prompt = `
You are a professional trading coach and strategy developer. Help create a comprehensive trading playbook based on the user's input.

USER INPUT:
${JSON.stringify(playbookData, null, 2)}

USER'S RECENT TRADING HISTORY (for context):
${JSON.stringify(userTrades?.slice(0, 20) || [], null, 2)}

Create a detailed, professional trading playbook that includes:

1. **Strategy Overview**: Clear description of the trading approach
2. **Market Conditions**: When this strategy works best
3. **Entry Criteria**: Specific, measurable conditions for entering trades
4. **Exit Criteria**: Clear rules for taking profits and cutting losses
5. **Risk Management**: Position sizing, stop losses, and risk controls
6. **Psychology Notes**: Mental preparation and emotional management
7. **Key Metrics to Track**: What to measure for this strategy
8. **Common Mistakes**: What to avoid when executing this strategy

Make it actionable, specific, and professional. Use the user's trading history to provide relevant examples and insights.

Respond with ONLY a valid JSON object with this structure:
{
  "detailed_content": "comprehensive_markdown_formatted_playbook",
  "entry_criteria": {
    "technical": ["criterion1", "criterion2"],
    "fundamental": ["criterion1", "criterion2"],
    "market_structure": ["criterion1", "criterion2"]
  },
  "exit_criteria": {
    "profit_targets": ["target1", "target2"],
    "stop_losses": ["stop1", "stop2"],
    "time_based": ["time1", "time2"]
  },
  "risk_management": {
    "position_sizing": "description",
    "max_risk_per_trade": "percentage",
    "max_daily_loss": "amount",
    "correlation_limits": "description"
  },
  "psychology_notes": "mental_preparation_and_emotional_management_notes",
  "ai_generated_insights": "key_insights_and_recommendations_based_on_user_data"
}
`;
        } else if (action === 'analyze_performance') {
            prompt = `
You are a trading performance analyst. Analyze the performance of this trading playbook and provide insights.

PLAYBOOK DATA:
${JSON.stringify(playbookData, null, 2)}

TRADES USING THIS PLAYBOOK:
${JSON.stringify(userTrades || [], null, 2)}

Analyze the performance and provide:
1. What's working well with this strategy
2. Areas for improvement
3. Specific adjustments to consider
4. Market conditions where it performs best/worst
5. Risk management effectiveness
6. Psychological challenges observed

Respond with ONLY a valid JSON object:
{
  "performance_analysis": "detailed_analysis_of_strategy_performance",
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2", "weakness3"],
  "recommendations": ["recommendation1", "recommendation2", "recommendation3"],
  "market_conditions_analysis": "when_strategy_works_best_and_worst",
  "risk_assessment": "analysis_of_risk_management_effectiveness"
}
`;
        } else if (action === 'suggest_improvements') {
            prompt = `
You are a trading strategy optimization expert. Based on the playbook and recent performance, suggest specific improvements.

CURRENT PLAYBOOK:
${JSON.stringify(playbookData, null, 2)}

RECENT PERFORMANCE DATA:
${JSON.stringify(userTrades || [], null, 2)}

Provide specific, actionable improvements to:
1. Entry criteria refinements
2. Exit strategy optimizations
3. Risk management enhancements
4. Psychology and discipline improvements
5. Market condition adaptations

Respond with ONLY a valid JSON object:
{
  "improved_entry_criteria": {
    "technical": ["improved_criterion1", "improved_criterion2"],
    "fundamental": ["improved_criterion1", "improved_criterion2"],
    "market_structure": ["improved_criterion1", "improved_criterion2"]
  },
  "improved_exit_criteria": {
    "profit_targets": ["improved_target1", "improved_target2"],
    "stop_losses": ["improved_stop1", "improved_stop2"],
    "time_based": ["improved_time1", "improved_time2"]
  },
  "improved_risk_management": {
    "position_sizing": "improved_description",
    "max_risk_per_trade": "improved_percentage",
    "max_daily_loss": "improved_amount",
    "correlation_limits": "improved_description"
  },
  "improvement_rationale": "explanation_of_why_these_improvements_are_suggested",
  "implementation_steps": ["step1", "step2", "step3"]
}
`;
        }

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    response_mime_type: "application/json",
                    temperature: 0.7,
                    max_output_tokens: 2000
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Gemini API error: ${response.status} ${errorText}`);
            throw new Error(`AI analysis failed due to an API error.`);
        }

        const geminiResponse = await response.json();
        
        if (!geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
            console.error('Unexpected Gemini response format:', geminiResponse);
            throw new Error('Failed to parse insights from AI.');
        }

        const insightsText = geminiResponse.candidates[0].content.parts[0].text;
        
        let insights;
        try {
            insights = JSON.parse(insightsText);
        } catch (parseError) {
            console.error('Failed to parse AI response as JSON:', insightsText);
            throw new Error('AI analysis result could not be parsed.');
        }

        return new Response(JSON.stringify(insights), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Error in generate-playbook-insights function:', error);
        const message = error.message.includes('API') || error.message.includes('AI') ? error.message : 'An internal error occurred during playbook analysis.';
        return new Response(JSON.stringify({ error: message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});