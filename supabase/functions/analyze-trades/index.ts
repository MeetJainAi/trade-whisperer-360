
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

        const prompt = `
You are a professional trading coach and data analyst. You are analyzing a trader's journal.
Based on the following trades, provide an analysis of their performance.

Trades data (up to 100 trades):
${JSON.stringify(tradesForAnalysis, (key, value) => (key === 'id' || key === 'user_id' || key === 'session_id' || key === 'created_at') ? undefined : value, 2)}

Please provide your analysis in a valid JSON object only, with no other text or explanations.
The JSON object must have the following structure:
{
  "ai_strengths": ["string", "string", "string"],
  "ai_mistakes": ["string", "string", "string"],
  "ai_fixes": ["string", "string", "string"],
  "ai_key_insight": "string"
}

Guidelines:
- ai_strengths: Identify 2-3 specific, positive patterns.
- ai_mistakes: Identify 2-3 specific, common mistakes.
- ai_fixes: Suggest 3 concrete, actionable steps for improvement.
- ai_key_insight: Provide one overarching, insightful summary.
`;

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    response_mime_type: "application/json",
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
        const insights = JSON.parse(insightsText);
        
        if (!insights.ai_strengths || !insights.ai_mistakes || !insights.ai_fixes || !insights.ai_key_insight) {
            console.error('Parsed insights object is missing required keys:', insights);
            throw new Error('AI analysis result is incomplete.');
        }

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
