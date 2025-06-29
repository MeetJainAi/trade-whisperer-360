import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

// Expanded canonical attributes for broker-agnostic mapping
const REQUIRED_COLUMNS = [
    { id: 'datetime', label: 'Date/Time' },
    { id: 'symbol', label: 'Symbol' },
    { id: 'qty', label: 'Quantity' },
    { id: 'pnl', label: 'Profit & Loss (P&L)' },
];

const OPTIONAL_COLUMNS = [
    { id: 'side', label: 'Side (Buy/Sell)' },
    { id: 'price', label: 'Price' },
    { id: 'buyPrice', label: 'Buy/Entry Price' },
    { id: 'sellPrice', label: 'Sell/Exit Price' },
    { id: 'buyFillId', label: 'Buy Fill ID (unique identifier for buy execution)' },
    { id: 'sellFillId', label: 'Sell Fill ID (unique identifier for sell execution)' },
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
This system is designed to be broker-agnostic and handle various CSV formats from different trading platforms.

The available CSV headers are: ${csvHeaders.join(', ')}.

Here is a sample of the data (first 3 rows):
${JSON.stringify(csvDataSample, null, 2)}

Please map these CSV headers to the following target attributes.

REQUIRED attributes (You MUST find a mapping for these):
${REQUIRED_COLUMNS.map(c => `- ${c.id} (${c.label})`).join('\n')}

OPTIONAL attributes (map them if you find a match):
${OPTIONAL_COLUMNS.map(c => `- ${c.id} (${c.label})`).join('\n')}

IMPORTANT MAPPING HINTS:
- 'datetime': Timestamp of the trade. Look for 'Date', 'Time', 'Execution Time', 'Timestamp', 'DateTime', 'TradeTime', 'boughtTimestamp', 'soldTimestamp'.
- 'symbol': Stock ticker or instrument. Look for 'Symbol', 'Ticker', 'Instrument', 'Contract', 'Security'.
- 'side': BUY/SELL direction. Look for 'Side', 'Action', 'Type', 'Direction', 'TradeType', 'Position'. May contain 'buy'/'sell', 'long'/'short', 'L'/'S', 'B'/'SL', 'Open'/'Close', 'IN'/'OUT', '1'/'-1'.
- 'qty': Trade quantity. Look for 'Qty', 'Quantity', 'Size', 'Amount', 'Volume', 'Shares', 'Contracts'.
- 'price': Execution price. Look for 'Price', 'Exec Price', 'Execution Price', 'Fill Price', 'Average Price'.
- 'buyPrice': Entry/buy price. Look for 'Buy Price', 'Entry Price', 'Open Price', 'buyPrice'.
- 'sellPrice': Exit/sell price. Look for 'Sell Price', 'Exit Price', 'Close Price', 'sellPrice'.
- 'buyFillId': Unique identifier for buy execution. Look for 'Buy Fill ID', 'buyFillId', 'Entry Fill ID', 'Open Fill ID', 'Buy Order ID'.
- 'sellFillId': Unique identifier for sell execution. Look for 'Sell Fill ID', 'sellFillId', 'Exit Fill ID', 'Close Fill ID', 'Sell Order ID'.
- 'pnl': Profit and Loss. Look for 'P&L', 'P/L', 'Profit', 'Loss', 'Realized P&L', 'Net PnL', 'Net Profit/Loss', 'PnL', 'Unrealized PnL'.

BROKER-SPECIFIC VARIATIONS TO CONSIDER:
- Some brokers use separate entry/exit price columns instead of a single price
- Side might be encoded as numbers (1=buy, -1=sell) or letters (L=long, S=short)
- Quantity might be signed (positive=buy, negative=sell)
- PnL formatting varies greatly between brokers
- Fill IDs are crucial for distinguishing between separate executions that might look identical otherwise
- Fill IDs might be named differently: 'FillId', 'OrderId', 'ExecutionId', 'TradeId', etc.

Your response MUST be a valid JSON object only, with no other text, comments, or explanations.
The keys must be the target attribute 'id's (e.g., "datetime", "symbol").
The values must be the corresponding CSV header name from the provided list.

If you cannot find a reasonable mapping for a REQUIRED attribute, still include it with your best guess.
For OPTIONAL attributes, only include them if you find a confident match.

Example response format:
{
  "datetime": "Execution Time",
  "symbol": "Symbol",
  "side": "Action",
  "qty": "Quantity",
  "price": "Exec Price",
  "buyPrice": "Entry Price",
  "sellPrice": "Exit Price",
  "buyFillId": "buyFillId",
  "sellFillId": "sellFillId",
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
                  temperature: 0.1,
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

        // Validate that we got mappings for required columns
        const missingRequired = REQUIRED_COLUMNS.filter(col => !mapping[col.id]);
        if (missingRequired.length > 0) {
            console.warn('Missing required mappings:', missingRequired.map(c => c.id));
        }

        console.log('Successfully mapped columns:', Object.keys(mapping));

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