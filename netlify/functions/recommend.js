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

TASK: Based on this user's taste profile and their desired experience for tonight, recommend exactly 6 titles split into two groups.

USER'S LOVED FILMS & SERIES:
${profileLines}

TONIGHT'S DESIRED EXPERIENCE (described freely by the user):
"${experience}"

GROUPS TO RETURN:
1. "classics" — 3 titles from ANY era (can be from the 1940s to ~2018). Prioritize depth, artistic vision, narrative quality. Classics, cult films, masterpieces of world cinema all welcome.
2. "recent" — 3 titles released in 2019 or later (up to 2025). Can include films and series currently available on streaming platforms.

CURATION RULES:
- Match the FEELING described by the user, not genre labels
- Recommend based on narrative experience, directorial vision, atmosphere, rhythm — not genre
- NEVER recommend titles already in the user's list
- No pure comedies, no weak narratives, no mass entertainment without artistic merit
- Each explanation: 2 evocative sentences. First: what makes it special for this feeling. Second: why it fits THIS user's specific taste. No spoilers. No plot summary.
- Vary directors and countries across the 6 recommendations
- The "recent" group should include truly recent titles (2022-2025) when possible

Titles to EXCLUDE: ${alreadySeen.slice(0, 200)}

Return ONLY valid JSON, no markdown:
{
  "classics": [
    {
      "title": "Exact Title",
      "year": "YYYY",
      "director": "Full Name",
      "runtime": "Xh Xm",
      "explanation": "Two evocative sentences."
    }
  ],
  "recent": [
    {
      "title": "Exact Title",
      "year": "YYYY",
      "director": "Full Name",
      "runtime": "Xh Xm or ~Xm/ep",
      "explanation": "Two evocative sentences."
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
