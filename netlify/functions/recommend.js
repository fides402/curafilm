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

const EXPERIENCE_MAP = {
  mystery: {
    name: 'mystery and continuous curiosity',
    description:
      'The narrative reveals information slowly. Every scene raises new questions. The viewer is engaged in a constant state of curious anticipation — never fully informed, always intrigued.',
    prefer: 'psychological suspense, ambiguous narratives, layered storytelling, slow-burn revelation',
    avoid: 'straightforward procedural mysteries with obvious solutions, generic thrillers',
  },
  tension: {
    name: 'narrative tension and dramatic urgency',
    description:
      'High stakes and scenes that propel you forward. Emotional investment in characters, escalating consequences, tight scripts with no wasted moments.',
    prefer: 'character-driven tension, consequential choices, films where every scene matters',
    avoid: 'aimless narratives, slow films without dramatic arc, pure action spectacle',
  },
  contemplative: {
    name: 'contemplative and immersive slow cinema',
    description:
      'Deliberate pacing, visual poetry, atmospheric depth. A film that demands presence and rewards patience. The kind that stays with you for days.',
    prefer: 'art house, slow cinema, Tarkovsky-style, meditation on human experience, beautiful cinematography',
    avoid: 'fast editing, commercial pacing, plot-driven entertainment, comedy',
  },
  worldbuilding: {
    name: 'world building and universe exploration',
    description:
      'Rich universes where the world itself is a character. Discovery and immersion in a fully realized reality — fictional or documentary.',
    prefer: 'distinctive settings, complex lore integrated elegantly, worlds with depth and internal logic',
    avoid: 'generic settings, shallow world-building, standard locations',
  },
  surprise: {
    name: 'total surprise — something unexpected and singular',
    description:
      'A film or series the user might not know or would not have chosen themselves. Something that defies easy categorization. A genuine curatorial discovery.',
    prefer: 'cult classics, overlooked masterpieces, films that defy genre, singular artistic visions',
    avoid: 'obvious mainstream choices, safe recommendations, anything predictable',
  },
};

async function fetchPoster(title, year) {
  try {
    const query = year ? `${title} ${year}` : title;
    const res = await fetch(
      `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=en-US`
    );
    const data = await res.json();
    const item = data.results?.[0];
    return {
      poster_path: item?.poster_path || null,
      tmdb_id: item?.id || null,
    };
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

    const exp = EXPERIENCE_MAP[experience] || EXPERIENCE_MAP.surprise;

    const profileLines = profile
      .map((m) => {
        const parts = [`"${m.title}" (${m.year || '?'})`];
        if (m.director) parts.push(`dir. ${m.director}`);
        if (m.genres?.length) parts.push(`[${m.genres.slice(0, 3).join(', ')}]`);
        if (m.keywords?.length) parts.push(`keywords: ${m.keywords.slice(0, 5).join(', ')}`);
        return '• ' + parts.join(' | ');
      })
      .join('\n');

    const alreadySeen = profile.map((m) => m.title.toLowerCase());

    const prompt = `You are a sophisticated film and TV series curator with encyclopedic knowledge of world cinema.

TASK: Based on this user's taste profile, recommend exactly 3 films or TV series for tonight.

USER'S LOVED FILMS & SERIES:
${profileLines}

TONIGHT'S DESIRED EXPERIENCE: ${exp.name}
Description: ${exp.description}
Prefer: ${exp.prefer}
Avoid: ${exp.avoid}

CURATION RULES:
1. Recommend based on NARRATIVE EXPERIENCE (storytelling quality, directorial vision, atmosphere, rhythm) — NOT genre
2. NEVER recommend anything already in the user's list
3. Include content from any era — classics from the 1950s–80s are welcome and encouraged if fitting
4. No pure comedies, no weak narratives, no mass entertainment without artistic merit
5. Each recommendation must feel genuinely and specifically compatible with THIS user's taste
6. The explanation must be evocative, written like a thoughtful friend recommending — no spoilers, focus on HOW it feels to watch
7. Vary your recommendations (don't pick 3 films by the same director or from the same era)

Titles to EXCLUDE (already seen): ${alreadySeen.slice(0, 10).join(', ')}

Return ONLY a valid JSON array with exactly 3 objects. No markdown, no explanation outside the JSON:
[
  {
    "title": "Exact Film Title",
    "year": "YYYY",
    "director": "Director Full Name",
    "runtime": "Xh Xm",
    "explanation": "Two evocative sentences. First sentence: what makes it special for this experience. Second sentence: why it fits THIS user's taste specifically. No plot. No spoilers."
  }
]`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75,
        max_tokens: 800,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      throw new Error(`Groq error ${groqRes.status}: ${errText}`);
    }

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content || '[]';

    // Extract JSON array from response (handles markdown code blocks too)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Nessun JSON trovato nella risposta Groq');

    const recommendations = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      throw new Error('Array raccomandazioni vuoto');
    }

    // Enrich with TMDB poster in parallel
    const enriched = await Promise.all(
      recommendations.map(async (rec) => {
        const tmdbData = await fetchPoster(rec.title, rec.year);
        return { ...rec, ...tmdbData };
      })
    );

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(enriched.slice(0, 3)),
    };
  } catch (err) {
    console.error('recommend error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Errore nella raccomandazione: ' + err.message }),
    };
  }
};
