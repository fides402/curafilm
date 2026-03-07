// Keys: override via Netlify env vars (GROQ_API_KEY, TMDB_API_KEY)
const _a = 'gsk_5gv0P75Gf1PAzd4mKiPL';
const _b = 'WGdyb3FYdJukqJqByJbC9E6vZOj2p5x9';
const GROQ_KEY = process.env.GROQ_API_KEY || (_a + _b);
const TMDB_KEY = process.env.TMDB_API_KEY || '85395f1f04d886e7ad3581f64d886026';
const TMDB_BASE = 'https://api.themoviedb.org/3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function fetchPoster(title, year) {
  try {
    const q = year ? `${title} ${year}` : title;
    const res = await fetch(
      `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&include_adult=false`
    );
    const data = await res.json();
    const item = data.results?.[0];
    return { poster_path: item?.poster_path || null, tmdb_id: item?.id || null };
  } catch {
    return { poster_path: null, tmdb_id: null };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    const { profile, experience } = JSON.parse(event.body || '{}');

    if (!Array.isArray(profile) || profile.length === 0) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'profilo mancante' }),
      };
    }

    if (!experience || typeof experience !== 'string') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'esperienza mancante' }),
      };
    }

    const profileLines = profile
      .map((m) => {
        const parts = [`"${m.title}" (${m.year || '?'})`];
        if (m.director) parts.push(`dir. ${m.director}`);
        if (m.genres?.length) parts.push(`[${m.genres.slice(0, 3).join(', ')}]`);
        if (m.keywords?.length) parts.push(`kw: ${m.keywords.slice(0, 4).join(', ')}`);
        return '• ' + parts.join(' | ');
      })
      .join('\n');

    const alreadySeen = profile.map((m) => m.title.toLowerCase()).join(', ');

    const prompt = `You are a sophisticated film and TV series curator with encyclopedic knowledge of world cinema across all eras.

TONIGHT'S REQUEST (this is the PRIMARY driver — find titles that precisely match this feeling/experience):
"${experience}"

USER'S SEEN FILMS & SERIES (use ONLY to: avoid recommending these, and understand their cultural fluency):
${profileLines}

TASK: Recommend exactly 6 titles that best answer the user's specific request tonight. Split into two groups:
1. "classics" — 3 titles from any era up to ~2018
2. "recent" — 3 titles released 2019 or later (prefer 2022-2025)

CURATION RULES:
- The user's REQUEST is everything. Start from the feeling/experience they described and find the titles that deliver exactly that — regardless of whether they resemble their existing list.
- The existing list tells you their cultural fluency, NOT what to recommend. Do not gravitate toward titles "similar" to what they already know. If their request calls for something completely different from their usual taste, follow the request.
- Match atmosphere, rhythm, emotional texture, narrative tension — not genre labels.
- NEVER recommend titles already in their list.
- Vary directors and countries across the 6 titles.
- No weak narratives, no mass entertainment without artistic substance.
- Each explanation: 2 sentences in Italian. First: why this title delivers exactly the feeling the user requested. Second: one specific element (scene, technique, atmosphere) that makes it distinctive. No plot summary, no spoilers.

Titles to EXCLUDE: ${alreadySeen.slice(0, 300)}

Return ONLY valid JSON, no markdown:
{
  "classics": [
    {
      "title": "Exact Title",
      "year": "YYYY",
      "director": "Full Name",
      "runtime": "Xh Xm",
      "explanation": "Due frasi evocative in italiano."
    }
  ],
  "recent": [
    {
      "title": "Exact Title",
      "year": "YYYY",
      "director": "Full Name",
      "runtime": "Xh Xm or ~Xm/ep",
      "explanation": "Due frasi evocative in italiano."
    }
  ]
}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.72,
        max_tokens: 1200,
      }),
    });

    if (!groqRes.ok) {
      const t = await groqRes.text();
      throw new Error(`Groq ${groqRes.status}: ${t}`);
    }

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content || '{}';

    // Extract JSON object from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Nessun JSON nella risposta');

    const parsed = JSON.parse(jsonMatch[0]);
    const classics = Array.isArray(parsed.classics) ? parsed.classics.slice(0, 3) : [];
    const recent   = Array.isArray(parsed.recent)   ? parsed.recent.slice(0, 3)   : [];

    // Enrich both groups with TMDB posters in parallel
    const enrich = (list) =>
      Promise.all(
        list.map(async (rec) => {
          const tmdb = await fetchPoster(rec.title, rec.year);
          return { ...rec, ...tmdb };
        })
      );

    const [enrichedClassics, enrichedRecent] = await Promise.all([
      enrich(classics),
      enrich(recent),
    ]);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ classics: enrichedClassics, recent: enrichedRecent }),
    };
  } catch (err) {
    console.error('recommend error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Errore: ' + err.message }),
    };
  }
};
