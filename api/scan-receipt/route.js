import { NextResponse } from 'next/server';

const MODEL = 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    customer: { type: 'STRING' },
    date: { type: 'STRING' },
    total: { type: 'NUMBER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          d: { type: 'STRING' },
          q: { type: 'NUMBER' },
          r: { type: 'NUMBER' },
        },
        required: ['d', 'q', 'r'],
      },
    },
  },
  required: ['items', 'total'],
};

export async function POST(req) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
    }

    const { imageBase64, mimeType = 'image/jpeg' } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: 'No image data provided.' }, { status: 400 });
    }

    const prompt = [
      'Extract POS receipt / bill items for an invoice.',
      'Return JSON matching the schema:',
      '- items: each item has d (item description), q (quantity, default 1), and r (UNIT rate per single item, NOT the combined line total).',
      '  Example: if a line reads "Valhomas Kohthu Rossi x 2" and "MVR 120.00", then d="Valhomas Kohthu Rossi", q=2, r=60.',
      '- Ignore non-item headers/footers like "Dine in", "Take away", or "Total".',
      '- total: numeric receipt total if shown, otherwise sum of (q * r).',
      '- date: YYYY-MM-DD if clearly shown on receipt, otherwise "".',
      '- customer: customer or table/order reference if shown, otherwise "".',
    ].join('\n');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: imageBase64 } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    const payload = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || 'Receipt scan failed.' },
        { status: res.status }
      );
    }

    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawText);

    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((it) => {
            const q = Number(it.q) > 0 ? Number(it.q) : 1;
            const r = Number(it.r) >= 0 ? Number(it.r) : 0;
            return {
              d: String(it.d || '').trim().slice(0, 50),
              q,
              r,
            };
          })
          .filter((it) => it.d || it.r > 0)
      : [];

    const computedTotal = items.reduce((sum, it) => sum + it.q * it.r, 0);
    const total = Number(parsed.total) > 0 ? Number(parsed.total) : computedTotal;

    return NextResponse.json({
      customer: String(parsed.customer || '').trim(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date || '')) ? String(parsed.date) : '',
      total,
      items,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Unexpected scan error.' }, { status: 500 });
  }
}
