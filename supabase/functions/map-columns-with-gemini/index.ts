
import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

const REQUIRED_COLUMNS = [
    { id: 'datetime', label: 'Date/Time' },
    { id: 'symbol', label: 'Symbol' },
    { id: 'side', label: 'Side (Buy/Sell)' },
    { id: 'qty', label: 'Quantity' },
    { id: 'price', label: 'Price' },
    { id: 'pnl', label: 'Profit & Loss (P&L)' },
];

const OPTIONAL_COLUMNS = [
    { id: 'notes', label: 'Notes' },
    { id: 'strategy', label: 'Strategy' },
    { id: 'tags', label: 'Tags (comma-separated)' },
    { id: 'image_url', label: 'Image URL' },
];

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

        const allTargetColumns = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

        const prompt = `
You are an expert financial data analyst. Your task is to map CSV headers to a predefined set of trade attributes.
The available CSV headers are: ${csvHeaders.join(', ')}.

Here is a sample of the data (first 3 rows):
${JSON.stringify(csvDataSample, null, 2)}

Please map these CSV headers to the following target attributes:
${allTargetColumns.map(c => `- ${c.id} (${c.label})`).join('\n')}

- The 'side' column should contain values like 'BUY' or 'SELL'.
- The 'pnl' is the Profit and Loss. It could be named 'pnl', 'profit', 'P/L', etc.
- The 'datetime' is the timestamp of the trade.
- The 'qty' is the quantity or size of the trade.

Your response must be a valid JSON object only, with no other text or explanations. The keys of the JSON object must be the target attribute 'id's and the values must be the corresponding CSV header name. If a mapping for a target attribute cannot be found in the CSV headers, do not include it in the JSON object.

Example response format:
{
  "datetime": "Execution Time",
  "symbol": "Symbol",
  "side": "Action",
  "qty": "Quantity",
  "price": "Exec Price",
  "pnl": "Realized P&L",
  "notes": "Description"
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
        const mappingText = geminiResponse.candidates[0].content.parts[0].text;
        const mapping = JSON.parse(mappingText);

        return new Response(JSON.stringify({ mapping }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Error mapping columns with Gemini:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
