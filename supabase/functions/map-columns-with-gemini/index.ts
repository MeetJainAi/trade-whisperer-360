
// import 'https://deno.land/x/xhr@0.1.0/mod.ts';
// import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

// const REQUIRED_COLUMNS = [
//     { id: 'datetime', label: 'Date/Time' },
//     { id: 'symbol', label: 'Symbol' },
//     { id: 'side', label: 'Side (Buy/Sell)' },
//     { id: 'qty', label: 'Quantity' },
//     { id: 'price', label: 'Price' },
//     { id: 'pnl', label: 'Profit & Loss (P&L)' },
// ];

// const OPTIONAL_COLUMNS = [
//     { id: 'notes', label: 'Notes' },
//     { id: 'strategy', label: 'Strategy' },
//     { id: 'tags', label: 'Tags (comma-separated)' },
//     { id: 'image_url', label: 'Image URL' },
// ];

// const corsHeaders = {
//   'Access-Control-Allow-Origin': '*',
//   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
// };

// serve(async (req) => {
//     if (req.method === 'OPTIONS') {
//         return new Response('ok', { headers: corsHeaders });
//     }

//     try {
//         const { csvHeaders, csvDataSample } = await req.json();

//         const prompt = `
// You are an expert financial data analyst. Your task is to intelligently map CSV headers to a predefined set of trade attributes.
// You must make your best effort to map all of the REQUIRED attributes. Be flexible with the naming.

// The available CSV headers are: ${csvHeaders.join(', ')}.

// Here is a sample of the data (first 3 rows):
// ${JSON.stringify(csvDataSample, null, 2)}

// Please map these CSV headers to the following target attributes.
// REQUIRED attributes (You MUST find a mapping for these):
// ${REQUIRED_COLUMNS.map(c => `- ${c.id} (${c.label})`).join('\n')}

// OPTIONAL attributes (map them if you find a match):
// ${OPTIONAL_COLUMNS.map(c => `- ${c.id} (${c.label})`).join('\n')}

// Here are some hints for mapping:
// - 'datetime': This is the timestamp of the trade. Look for headers like 'Date', 'Time', 'Execution Time', 'Timestamp'.
// - 'symbol': This is the stock ticker or trading instrument. Look for 'Symbol', 'Ticker', 'Instrument'.
// - 'side': This indicates 'BUY' or 'SELL'. Look for 'Side', 'Action', 'Type', 'Transaction Type'. The data sample might contain 'buy'/'sell' or 'long'/'short'.
// - 'qty': This is the quantity or size of the trade. Look for 'Qty', 'Quantity', 'Size', 'Amount'.
// - 'price': This is the execution price per share/contract. Look for 'Price', 'Exec Price', 'Execution Price'.
// - 'pnl': This is the Profit and Loss. This is a crucial field. Look for 'P&L', 'P/L', 'Profit', 'Loss', 'Realized P&L', 'Net PnL'. The values can be positive or negative.

// Your response MUST be a valid JSON object only, with no other text, comments, or explanations.
// The keys of the JSON object must be the target attribute 'id's (e.g., "datetime", "symbol").
// The values must be the corresponding CSV header name from the provided list.

// If you are confident you've found a mapping for a header, include it. If a mapping for an OPTIONAL attribute cannot be reasonably found, you can omit it. However, you must try your best to find a mapping for all REQUIRED attributes.

// Example response format:
// {
//   "datetime": "Execution Time",
//   "symbol": "Symbol",
//   "side": "Action",
//   "qty": "Quantity",
//   "price": "Exec Price",
//   "pnl": "Realized P&L",
//   "notes": "Description"
// }
// `;

//         const response = await fetch(GEMINI_API_URL, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify({
//                 contents: [{ parts: [{ text: prompt }] }],
//                 generationConfig: {
//                   response_mime_type: "application/json",
//                 }
//             }),
//         });

//         if (!response.ok) {
//             const errorText = await response.text();
//             throw new Error(`Gemini API error: ${response.status} ${errorText}`);
//         }

//         const geminiResponse = await response.json();
//         const mappingText = geminiResponse.candidates[0].content.parts[0].text;
//         const mapping = JSON.parse(mappingText);

//         return new Response(JSON.stringify({ mapping }), {
//             headers: { ...corsHeaders, 'Content-Type': 'application/json' },
//             status: 200,
//         });

//     } catch (error) {
//         console.error('Error mapping columns with Gemini:', error);
//         return new Response(JSON.stringify({ error: error.message }), {
//             headers: { ...corsHeaders, 'Content-Type': 'application/json' },
//             status: 500,
//         });
//     }
// });





// ------------------------------------------------update from gpt -----------------------------------

// deno-lint-ignore-file no-explicit-any
// ───────────────────────────────────────────────────────────────
//  Supabase Edge / Deno – CSV-to-Attribute Mapper powered by Gemini 1.5
//  Key upgrades:
//    • Uses responseSchema  ➜ guaranteed JSON (no extra parsing)
//    • Strong runtime validations & graceful errors
//    • Memoises identical header sets to save tokens / latency
//    • Cheaper prompt (system + user split, trimmed sample)
// ───────────────────────────────────────────────────────────────

// import 'https://deno.land/x/xhr@0.1.0/mod.ts';
// import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// // ─────────── ENV & CONSTANTS ──────────────────────────────────
// const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

// const GEMINI_API_URL =
//   `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

// const REQUIRED = ['datetime', 'symbol', 'side', 'qty', 'price', 'pnl'] as const;
// const OPTIONAL = ['notes', 'strategy', 'tags', 'image_url'] as const;

// type Col = (typeof REQUIRED)[number] | (typeof OPTIONAL)[number];

// const cors = {
//   'Access-Control-Allow-Origin': '*',
//   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
// };

// // In-memory cache keyed by header signature
// const cache = new Map<string, Record<Col, string>>();

// // JSON schema Gemini must follow
// const responseSchema = {
//   type: 'object',
//   properties: Object.fromEntries(
//     [...REQUIRED, ...OPTIONAL].map((p) => [p, { type: 'string' }]),
//   ),
//   required: [...REQUIRED],
// };

// // ─────────── SERVER HANDLER ───────────────────────────────────
// serve(async (req) => {
//   // CORS pre-flight
//   if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

//   try {
//     // ---------- Validate body ----------
//     const { csvHeaders, csvDataSample } = await req.json();
//     if (!Array.isArray(csvHeaders) || csvHeaders.length === 0) {
//       throw new Error('csvHeaders must be a non-empty array');
//     }

//     // Use at most 3 rows to keep token usage low
//     const sample = JSON.stringify(csvDataSample?.slice?.(0, 3) ?? []);

//     // ---------- Memoisation ----------
//     const sig = csvHeaders.sort().join('|');
//     if (cache.has(sig)) {
//       return json({ mapping: cache.get(sig) }, 200);
//     }

//     // ---------- Build prompt ----------
//     const system = `
// You are an expert trade-data analyst. 
// Return a JSON mapping from our canonical field → the matching CSV header.
// Respond **only** with JSON that matches the provided schema.`;

//     const user = `
// CSV headers: ${csvHeaders.join(', ')}

// Data sample (first rows):
// ${sample}

// Fields to map (all REQUIRED must be present):
// REQUIRED → ${REQUIRED.join(', ')}
// OPTIONAL → ${OPTIONAL.join(', ')}
// Notes:
// - 'side' may appear as BUY/SELL, long/short, L/S, 1/-1, etc.
// - 'datetime' format can vary; look for execution time or timestamp columns.
// `;

//     // ---------- Gemini call ----------
//     const gRes = await fetch(GEMINI_API_URL, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         contents: [
//           { role: 'system', parts: [{ text: system.trim() }] },
//           { role: 'user', parts: [{ text: user.trim() }] },
//         ],
//         generationConfig: {
//           response_mime_type: 'application/json',   // forces raw JSON
//           response_schema: responseSchema,          // extra safety
//           temperature: 0,                           // deterministic
//         },
//       }),
//     });

//     if (!gRes.ok) {
//       throw new Error(`Gemini API ${gRes.status}: ${await gRes.text()}`);
//     }

//     const { candidates } = await gRes.json();
//     const mapping = JSON.parse(candidates?.[0]?.content?.parts?.[0]?.text ?? '{}');

//     // Basic sanity-check: all required keys are present
//     for (const key of REQUIRED) {
//       if (!mapping?.[key]) throw new Error(`Missing required mapping: ${key}`);
//     }

//     cache.set(sig, mapping);
//     return json({ mapping }, 200);

//   } catch (err: any) {
//     console.error('Mapper error:', err);
//     return json({ error: err.message }, 500);
//   }
// });

// // ─────────── HELPERS ──────────────────────────────────────────
// function json(body: unknown, status = 200) {
//   return new Response(JSON.stringify(body), {
//     status,
//     headers: { ...cors, 'Content-Type': 'application/json' },
//   });
// }




// ----------------------------gemini --------------------------------------------------------------------

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
- 'side': This indicates 'BUY' or 'SELL'. Look for 'Side', 'Action', 'Type', 'Transaction Type', 'Direction', 'TradeType', 'Position'. The data sample might contain 'buy'/'sell', 'long'/'short', 'L'/'S', 'B'/'SL', 'Open'/'Close', 'IN'/'OUT' or numerical values like '1' for buy and '-1' for sell.
- 'qty': This is the quantity or size of the trade. Look for 'Qty', 'Quantity', 'Size', 'Amount'.
- 'price': This is the execution price per share/contract. Look for 'Price', 'Exec Price', 'Execution Price'.
- 'pnl': This is the Profit and Loss. This is a crucial field. Look for 'P&L', 'P/L', 'Profit', 'Loss', 'Realized P&L', 'Net PnL', 'Net Profit/Loss'. The values can be positive or negative.

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