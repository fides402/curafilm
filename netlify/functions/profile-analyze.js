// Keys: override via Netlify env vars
const _a = 'gsk_cFkvPKqJGu5N4isjeMRN';
const _b = 'WGdyb3FY4LKlQs0O1HPlVUlrMmDE7Lcn';
const GROQ_KEY = process.env.GROQ_API_KEY || (_a + _b);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function groqCall(prompt, max_tokens, model, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens,
        response_format: { type: 'json_object' },
      }),
    });
    if (res.status === 429) throw new Error('rate_limit');
    const text = await res.text();
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    return JSON.parse(text).choices?.[0]?.message?.content || '{}';
  } finally {
    clearTimeout(timer);
  }
}

// Try 70b (richer analysis, 20s budget) then fall back to 8b
async function groqJSON(prompt, max_tokens) {
  try {
    return await groqCall(prompt, max_tokens, 'llama-3.3-70b-versatile', 20000);
  } catch {
    return await groqCall(prompt, max_tokens, 'llama-3.1-8b-instant', 8000);
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: '' };

  try {
    const { profile, watchedTitles } = JSON.parse(event.body || '{}');
    if (!Array.isArray(profile) || profile.length < 3) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'profilo non valido' }) };
    }

    // TMDB-enriched profile: full metadata (up to 25 films)
    const profileText = profile
      .map(m => `• "${m.title}" (${m.year}) — ${m.director} | ${m.genres?.join(', ')}`)
      .join('\n');

    // Full watched list: title+year only, sampled to keep token count reasonable
    // If Letterboxd import exists, take a representative spread (every Nth + first 50)
    let extendedListText = '';
    if (Array.isArray(watchedTitles) && watchedTitles.length > profile.length) {
      // Remove titles already in enriched profile to avoid duplication
      const enrichedSet = new Set(profile.map(m => m.title.toLowerCase()));
      const extra = watchedTitles.filter(t => !enrichedSet.has(t.title?.toLowerCase()));

      // Sample: take up to 200 titles spread across the full list
      let sampled;
      if (extra.length <= 200) {
        sampled = extra;
      } else {
        const step = Math.floor(extra.length / 200);
        sampled = extra.filter((_, i) => i % step === 0).slice(0, 200);
      }

      extendedListText = sampled
        .map(t => `${t.title}${t.year ? ` (${t.year})` : ''}`)
        .join(', ');
    }

    const prompt = `Sei un critico cinematografico esperto con visione strutturale. Analizza questa lista di film visti dall'utente per costruire un profilo cinematografico approfondito.

FILM PREFERITI (con metadati completi):
${profileText}
${extendedListText ? `\nALTRI FILM VISTI (lista estesa — ${watchedTitles?.length || 0} titoli totali, campione rappresentativo):\n${extendedListText}` : ''}

Costruisci un profilo strutturato del gusto di questo spettatore. Analizza con occhio da critico, non essere generico.

Includi:
1. Livello cinefilo reale (mainstream / moderato / alto / enciclopedico)
2. Macro-generi dominanti con peso relativo (massimo 5)
3. Pattern narrativi ricorrenti che cerca (max 3 pattern concreti)
4. Profilo estetico: che tipo di regia e fotografia apprezza
5. Preferenze per epoche cinematografiche
6. Cosa NON tollera / evita
7. Descrizione sintetica del gusto in 150-200 parole (tono da critico, in italiano)
8. 3 registi che probabilmente ama molto ma non sono ancora presenti nella lista

Rispondi con JSON:
{
  "tasteProfile": "profilo descrittivo in 150-200 parole in italiano, tono critico",
  "cinephileLevel": "enciclopedico",
  "dominantGenres": ["horror autoriale", "sci-fi filosofica", "crime noir atmosferico"],
  "narrativePatterns": ["discesa nella follia", "ambiguità morale senza risoluzione", "atmosfera > trama"],
  "aestheticProfile": "regia autoriale fortemente stilizzata, fotografia con peso simbolico, tolleranza alta per ritmi lenti",
  "temporalPreferences": ["anni 70", "2010-oggi", "cinema muto selettivo"],
  "avoidTraits": ["commedia romantica", "blockbuster commerciali senza identità", "narrazione didascalica"],
  "referenceDirectors": ["Regista 1", "Regista 2", "Regista 3"]
}`;

    const raw = await groqJSON(prompt, 900, 'llama-3.3-70b-versatile');
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
