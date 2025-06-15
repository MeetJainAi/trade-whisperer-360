
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
        const { csvHeaders, csvDataSample } = await req.json();

        const prompt = `
You are a financial data analysis assistant. Your task is to determine if a given CSV file contains financial trading data.
Look for common trading-related headers like 'symbol', 'ticker', 'side', 'buy', 'sell', 'quantity', 'qty', 'price', 'pnl', 'profit', 'loss', 'datetime', 'timestamp'.

The available CSV headers are: ${csvHeaders.join(', ')}.

Here is a sample of the data (first 3 rows):
${JSON.stringify(csvDataSample, null, 2)}

Based on these headers and data, is this a list of financial trades?

Your response must be a valid JSON object only, with no other text or explanations. The JSON object should have a single key "is_trading_related" with a boolean value.

Example of a positive response:
{
  "is_trading_related": true
}

Example of a negative response:
{
  "is_trading_related": false
}
`;

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  response_mime_type: "application/json",
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
        }

        const geminiResponse = await response.json();
        const resultText = geminiResponse.candidates[0].content.parts[0].text;
        const result = JSON.parse(resultText);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Error validating CSV with Gemini:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
