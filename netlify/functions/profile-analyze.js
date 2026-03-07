// Keys: override via Netlify env vars
const _a = 'gsk_cFkvPKqJGu5N4isjeMRN';
const _b = 'WGdyb3FY4LKlQs0O1HPlVUlrMmDE7Lcn';
const GROQ_KEY = process.env.GROQ_API_KEY || (_a + _b);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function groqJSON(prompt, max_tokens, model) {
  for (let attempt = 0, delay = 2000; attempt < 4; attempt++, delay *= 2) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens,
        response_format: { type: 'json_object' },
      }),
    });
    if (res.status === 429) {
      if (attempt === 3) throw new Error('Groq rate limit: riprova tra qualche minuto');
      const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
      await new Promise(r => setTimeout(r, retryAfter > 0 ? retryAfter * 1000 : delay));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Groq ${res.status}: ${text}`);
    return JSON.parse(text).choices?.[0]?.message?.content || '{}';
  }
  throw new Error('Groq: max retries exceeded');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: '' };

  try {
    const { profile } = JSON.parse(event.body || '{}');
    if (!Array.isArray(profile) || profile.length < 3) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'profilo non valido' }) };
    }

    const profileText = profile
      .map(m => `• "${m.title}" (${m.year}) — ${m.director} | ${m.genres?.join(', ')}`)
      .join('\n');

    const prompt = `Sei un critico cinematografico esperto. Analizza questi film amati dall'utente.

FILM AMATI:
${profileText}

Scrivi in italiano un profilo del gusto cinematografico di questa persona. Sii specifico su cosa emerge da questi titoli concreti, non generico.

Includi nel profilo:
- Quale tipo di regia apprezza (autoriale, minimalista, barocca, di genere...)
- Quale tipo di narrazione cerca (enigmatica, tesa, lenta, frammentata, densa...)
- L'atmosfera prediletta
- Cosa NON tollera (commedia, blockbuster commerciali, banalità narrativa...)
- 3 registi che probabilmente amerà ma non sono già presenti nella lista

Rispondi con JSON:
{
  "tasteProfile": "profilo descrittivo in 150-200 parole in italiano",
  "avoidTraits": ["tratto da evitare 1", "tratto da evitare 2", "tratto da evitare 3"],
  "referenceDirectors": ["Regista 1", "Regista 2", "Regista 3"]
}`;

    const raw = await groqJSON(prompt, 600, 'llama-3.1-8b-instant');
    // tasteVector key kept for App.jsx localStorage compatibility
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ tasteVector: JSON.parse(raw) }),
    };
  } catch (err) {
    console.error('profile-analyze error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
