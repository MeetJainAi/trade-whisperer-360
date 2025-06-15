
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

        const prompt = `
You are an expert financial data analyst. Your task is to intelligently map CSV headers to a predefined set of trade attributes.
You must make your best effort to map all of the REQUIRED attributes. Be flexible with the naming.

The available CSV headers are: ${csvHeaders.join(', ')}.

Here is a sample of the data (first 3 rows):
${JSON.stringify(csvDataSample, null, 2)}

Please map these CSV headers to the following target attributes.
REQUIRED attributes (You MUST find a mapping for these):
${REQUIRED_COLUMNS.map(c => `- ${c.id} (${c.label})`).join('\n')}

OPTIONAL attributes (map them if you find a match):
${OPTIONAL_COLUMNS.map(c => `- ${c.id} (${c.label})`).join('\n')}

Here are some hints for mapping:
- 'datetime': This is the timestamp of the trade. Look for headers like 'Date', 'Time', 'Execution Time', 'Timestamp'.
- 'symbol': This is the stock ticker or trading instrument. Look for 'Symbol', 'Ticker', 'Instrument'.
- 'side': This indicates 'BUY' or 'SELL'. Look for 'Side', 'Action', 'Type', 'Transaction Type'. The data sample might contain 'buy'/'sell' or 'long'/'short'.
- 'qty': This is the quantity or size of the trade. Look for 'Qty', 'Quantity', 'Size', 'Amount'.
- 'price': This is the execution price per share/contract. Look for 'Price', 'Exec Price', 'Execution Price'.
- 'pnl': This is the Profit and Loss. This is a crucial field. Look for 'P&L', 'P/L', 'Profit', 'Loss', 'Realized P&L', 'Net PnL'. The values can be positive or negative.

Your response MUST be a valid JSON object only, with no other text, comments, or explanations.
The keys of the JSON object must be the target attribute 'id's (e.g., "datetime", "symbol").
The values must be the corresponding CSV header name from the provided list.

If you are confident you've found a mapping for a header, include it. If a mapping for an OPTIONAL attribute cannot be reasonably found, you can omit it. However, you must try your best to find a mapping for all REQUIRED attributes.

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
