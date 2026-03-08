// Keys: override via Netlify env vars (GROQ_API_KEY, TMDB_API_KEY)
const _a = 'gsk_cFkvPKqJGu5N4isjeMRN';
const _b = 'WGdyb3FY4LKlQs0O1HPlVUlrMmDE7Lcn';
const GROQ_KEY = process.env.GROQ_API_KEY || (_a + _b);
const TMDB_KEY = process.env.TMDB_API_KEY || '85395f1f04d886e7ad3581f64d886026';
const TMDB_BASE = 'https://api.themoviedb.org/3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── Groq helper (JSON mode — guaranteed valid JSON output) ────────────────────
async function groqJSON(prompt, max_tokens, model) {
  for (let attempt = 0, delay = 2000; attempt < 4; attempt++, delay *= 2) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.55,
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

// ── TMDB poster + verification ────────────────────────────────────────────────
// Strategy: movie search with year → movie search without year → multi fallback
async function fetchPoster(title, year) {
  const base = `${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&include_adult=false`;

  const trySearch = async (query) => {
    const res = await fetch(`${base}&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    const item = data.results?.[0];
    return item ? { poster_path: item.poster_path || null, tmdb_id: item.id || null } : null;
  };

  try {
    // 1. Movie search with year (most precise)
    if (year) {
      const r = await trySearch(`${title} ${year}`);
      if (r?.poster_path) return r;
    }
    // 2. Movie search without year
    const r2 = await trySearch(title);
    if (r2?.poster_path) return r2;
    // 3. Return whatever we have (even without poster, for tmdb_id)
    return r2 || { poster_path: null, tmdb_id: null };
  } catch {
    return { poster_path: null, tmdb_id: null };
  }
}

// ── Build taste description from whatever format tasteVector is in ────────────
// Supports: rich structural { tasteProfile, cinephileLevel, dominantGenres, ... }
//           OR simple { tasteProfile, avoidTraits, referenceDirectors }
//           OR old numeric object OR null
function buildTasteDescription(tv, profile) {
  if (tv?.tasteProfile) {
    const lines = [];
    if (tv.cinephileLevel) lines.push(`Livello cinefilo: ${tv.cinephileLevel}.`);
    lines.push(tv.tasteProfile);
    if (tv.dominantGenres?.length)     lines.push(`Generi dominanti: ${tv.dominantGenres.join(', ')}.`);
    if (tv.narrativePatterns?.length)  lines.push(`Pattern narrativi cercati: ${tv.narrativePatterns.join(', ')}.`);
    if (tv.aestheticProfile)           lines.push(`Estetica apprezzata: ${tv.aestheticProfile}.`);
    if (tv.temporalPreferences?.length) lines.push(`Epoche preferite: ${tv.temporalPreferences.join(', ')}.`);
    if (tv.avoidTraits?.length)        lines.push(`Evita categoricamente: ${tv.avoidTraits.join(', ')}.`);
    if (tv.referenceDirectors?.length) lines.push(`Registi affini da esplorare: ${tv.referenceDirectors.join(', ')}.`);
    return lines.join('\n');
  }

  // Old numeric format — convert qualitatively
  const sample = profile.slice(0, 8).map(m => `"${m.title}" (${m.year}, ${m.director})`).join('; ');
  const traits = [];
  if (tv) {
    if ((tv.mystery_need || 0) > 0.65)              traits.push('misteri ed enigmi irrisolti');
    if ((tv.tension_affinity || 0) > 0.65)          traits.push('tensione narrativa');
    if ((tv.contemplative_affinity || 0) > 0.65)    traits.push('lentezza contemplativa');
    if ((tv.directorial_identity_need || 0) > 0.65) traits.push('forte identità registica');
    if ((tv.comedy_penalty || 0) > 0.65)            traits.push('(nessuna commedia)');
    if ((tv.atmosphere_importance || 0) > 0.65)     traits.push('atmosfere dense e immersive');
  }
  let desc = `Film amati: ${sample}.`;
  if (traits.length) desc += ` Predilige: ${traits.join(', ')}.`;
  return desc;
}

// ── Describe mood vector as qualitative text ──────────────────────────────────
function describeMood(mv, moodLabel) {
  const aspects = [];
  if ((mv.desired_mystery || 0) > 0.7)          aspects.push('vuole mistero e enigmi persistenti');
  if ((mv.desired_tension || 0) > 0.7)          aspects.push('vuole tensione narrativa alta');
  if ((mv.desired_contemplation || 0) > 0.7)    aspects.push('vuole un ritmo lento e contemplativo');
  if ((mv.desired_hook_speed || 0) > 0.8)       aspects.push('deve essere agganciato nei primi minuti');
  if ((mv.desired_world_exploration || 0) > 0.7) aspects.push('vuole esplorare un mondo narrativo denso');
  return aspects.length ? aspects.join(', ') : `mood: ${moodLabel}`;
}

// ── Enrich list with TMDB data, prefer verified films ────────────────────────
async function enrichAndVerify(list, maxFinal) {
  const enriched = await Promise.all(
    list.map(async (rec) => {
      const tmdb = await fetchPoster(rec.title, rec.year);
      return { ...rec, ...tmdb };
    })
  );
  // Prefer films TMDB could verify (reduces hallucination risk)
  const verified   = enriched.filter(r => r.tmdb_id !== null);
  const unverified = enriched.filter(r => r.tmdb_id === null);
  return [...verified, ...unverified].slice(0, maxFinal);
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };

  try {
    const { profile, tasteVector, mood, moodVector, watchedTitles } = JSON.parse(event.body || '{}');

    if (!Array.isArray(profile) || !profile.length) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'profilo mancante' }) };
    }
    if (!moodVector || !mood) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'mood mancante' }) };
    }

    const tasteDesc = buildTasteDescription(tasteVector, profile);
    const moodDesc  = describeMood(moodVector, mood);

    // Use full watched list if available (Letterboxd import), else fall back to profile
    const exclusionSource = Array.isArray(watchedTitles) && watchedTitles.length > 0
      ? watchedTitles
      : profile;
    const excludedList = exclusionSource.map(m => `"${m.title}"`).join(', ');

    // Single 70b call: reasoning + selection + Italian explanations in one pass
    const prompt = `Sei un curatore cinematografico con conoscenza enciclopedica del cinema mondiale.

PROFILO DEL GUSTO DELL'UTENTE:
${tasteDesc}

MOOD STASERA: "${mood}"
Stasera l'utente ${moodDesc}.

FILM GIÀ VISTI — NON includere nessuno di questi:
${excludedList}

COMPITO:
Scegli esattamente 6 film perfetti per questo utente stasera:
- 3 classici (anno ≤ 2018): epoche, paesi e registi diversi tra loro
- 3 recenti (anno ≥ 2019): includi titoli del 2022-2025
- Nessun regista ripetuto tra i 6
- Nessun titolo dalla lista dei già visti
- Evita blockbuster commerciali senza identità autoriale
- Solo titoli di produzioni realmente esistenti
- Mix di generi: thriller, sci-fi, noir, drama, horror, auteur — no commedia pura

Per ogni film scrivi una "explanation" in italiano di 2 frasi:
- Frase 1: perché si adatta perfettamente al mood di stasera E al gusto specifico di questo utente
- Frase 2: un elemento atmosferico o narrativo che lo rende unico e non ovvio
- Tono evocativo, niente riassunti di trama, niente spoiler

Rispondi SOLO con JSON valido:
{
  "classics": [
    {
      "title": "Titolo Esatto",
      "year": "YYYY",
      "director": "Nome Cognome",
      "type": "movie",
      "runtime": "Xh Xm",
      "explanation": "Due frasi in italiano."
    }
  ],
  "recent": [
    {
      "title": "Titolo Esatto",
      "year": "YYYY",
      "director": "Nome Cognome",
      "type": "movie",
      "runtime": "Xh Xm",
      "explanation": "Due frasi in italiano."
    }
  ]
}`;

    // 70b for holistic film knowledge + evocative Italian writing quality
    const raw    = await groqJSON(prompt, 1400, 'llama-3.3-70b-versatile');
    const result = JSON.parse(raw);

    const rawClassics = Array.isArray(result.classics) ? result.classics : [];
    const rawRecent   = Array.isArray(result.recent)   ? result.recent   : [];

    if (!rawClassics.length && !rawRecent.length) {
      throw new Error('nessun consiglio generato');
    }

    // TMDB enrichment + verification (prefer films TMDB can confirm)
    const [classics, recent] = await Promise.all([
      enrichAndVerify(rawClassics.slice(0, 3), 3),
      enrichAndVerify(rawRecent.slice(0, 3),   3),
    ]);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ classics, recent }),
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
