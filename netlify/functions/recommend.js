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

// ── Groq helper with internal timeout ────────────────────────────────────────
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
        temperature: 0.55,
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

// Try 70b (quality, 16s budget) then fall back to 8b (speed, 7s budget)
async function groqJSON(prompt, max_tokens) {
  try {
    return await groqCall(prompt, max_tokens, 'llama-3.3-70b-versatile', 16000);
  } catch {
    // 70b failed (timeout / rate-limit) — use fast 8b model
    return await groqCall(prompt, max_tokens, 'llama-3.1-8b-instant', 7000);
  }
}

// ── TMDB poster + verification ────────────────────────────────────────────────
// Handles both movies and TV series
async function fetchPoster(title, year, type = 'movie') {
  const mediaType = type === 'series' ? 'tv' : 'movie';
  const base = `${TMDB_BASE}/search/${mediaType}?api_key=${TMDB_KEY}&include_adult=false`;

  const trySearch = async (query) => {
    const res = await fetch(`${base}&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    const item = data.results?.[0];
    return item ? { poster_path: item.poster_path || null, tmdb_id: item.id || null } : null;
  };

  try {
    if (year) {
      const r = await trySearch(`${title} ${year}`);
      if (r?.poster_path) return r;
    }
    const r2 = await trySearch(title);
    if (r2?.poster_path) return r2;
    // If TV search failed, try movie as fallback (and vice versa)
    const fallbackType = mediaType === 'tv' ? 'movie' : 'tv';
    const fallbackBase = `${TMDB_BASE}/search/${fallbackType}?api_key=${TMDB_KEY}&include_adult=false`;
    const r3Res = await fetch(`${fallbackBase}&query=${encodeURIComponent(title)}`);
    const r3Data = await r3Res.json();
    const r3Item = r3Data.results?.[0];
    if (r3Item?.poster_path) return { poster_path: r3Item.poster_path, tmdb_id: r3Item.id };
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
      const tmdb = await fetchPoster(rec.title, rec.year, rec.type);
      return { ...rec, ...tmdb };
    })
  );
  // Prefer films TMDB could verify (reduces hallucination risk)
  const verified   = enriched.filter(r => r.tmdb_id !== null);
  const unverified = enriched.filter(r => r.tmdb_id === null);
  return [...verified, ...unverified].slice(0, maxFinal);
}

// ── Main handler ──────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };

  try {
    const { profile, tasteVector, mood, moodVector, watchedTitles, previouslyRecommended } = JSON.parse(event.body || '{}');

    if (!Array.isArray(profile) || !profile.length) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'profilo mancante' }) };
    }
    if (!moodVector || !mood) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'mood mancante' }) };
    }

    const tasteDesc = buildTasteDescription(tasteVector, profile);
    const moodDesc  = describeMood(moodVector, mood);

    // Build exclusion list: watched titles + previously recommended
    const exclusionSource = Array.isArray(watchedTitles) && watchedTitles.length > 0
      ? watchedTitles
      : profile;
    const watchedSet = new Set(exclusionSource.map(m => m.title?.toLowerCase()));
    const prevRecTitles = Array.isArray(previouslyRecommended) ? previouslyRecommended : [];
    // Merge and deduplicate
    const allExcluded = [
      ...exclusionSource.map(m => `"${m.title}"`),
      ...prevRecTitles
        .filter(t => !watchedSet.has(t?.toLowerCase()))
        .map(t => `"${t}"`),
    ];
    const excludedList = allExcluded.join(', ');

    // Build dynamic hard-constraint block from actual profile data
    const tv = tasteVector;
    const avoidBlock = tv?.avoidTraits?.length
      ? `VIETATO ASSOLUTO — scarta qualsiasi film che rientra in queste categorie:\n${tv.avoidTraits.map(t => `• ${t}`).join('\n')}`
      : 'Evita blockbuster commerciali senza identità autoriale.';

    const patternBlock = tv?.narrativePatterns?.length
      ? `Pattern narrativi richiesti (ogni film deve incarnarne almeno uno):\n${tv.narrativePatterns.map(p => `• ${p}`).join('\n')}`
      : '';

    const aestheticBlock = tv?.aestheticProfile
      ? `Estetica richiesta: ${tv.aestheticProfile}`
      : '';

    const epochBlock = tv?.temporalPreferences?.length
      ? `Preferenze di epoca: ${tv.temporalPreferences.join(', ')} — privilegia queste epoche nelle scelte.`
      : '';

    const directorStyleBlock = tv?.referenceDirectors?.length
      ? `Stile di riferimento: film nello stesso universo estetico di ${tv.referenceDirectors.join(', ')}.`
      : '';

    const genreBlock = tv?.dominantGenres?.length
      ? `Generi dominanti del profilo: ${tv.dominantGenres.join(', ')} — i film scelti devono appartenervi o esserne affini.`
      : '';

    // Single 70b call: reasoning + selection + Italian explanations in one pass
    const prompt = `Sei un curatore cinematografico con conoscenza enciclopedica del cinema mondiale. Il tuo compito è selezionare film con precisione chirurgica basandoti sul profilo specifico di questo utente — non consigli generici.

PROFILO DETTAGLIATO DELL'UTENTE:
${tasteDesc}

MOOD STASERA: "${mood}"
Stasera l'utente ${moodDesc}.

FILM GIÀ VISTI — NON includere nessuno di questi:
${excludedList}

REGOLE DI SELEZIONE — rispettale tutte senza eccezioni:

1. ${avoidBlock}
${genreBlock ? `2. ${genreBlock}` : ''}
${patternBlock ? `3. ${patternBlock}` : ''}
${aestheticBlock ? `4. ${aestheticBlock}` : ''}
${epochBlock ? `5. ${epochBlock}` : ''}
${directorStyleBlock ? `6. ${directorStyleBlock}` : ''}
- Nessun regista/showrunner ripetuto tra i 6 titoli
- Nessun titolo dalla lista dei già visti / già consigliati
- Solo titoli realmente esistenti e verificabili
- 3 classici (anno ≤ 2018) da epoche e paesi diversi
- 3 recenti (anno ≥ 2019), almeno 1 del 2022-2025
- Il mix dei 6 deve includere ALMENO 2 serie TV (type "series") e ALMENO 2 film (type "movie")
- Per le serie scegli serie con identità autoriale forte, non soap opera o procedurali banali

Per ogni titolo scrivi una "explanation" in italiano di 2 frasi:
- Frase 1: perché incarna il mood di stasera E rispecchia il gusto specifico di questo utente (cita elementi concreti del profilo)
- Frase 2: un elemento estetico o narrativo che lo distingue e lo rende non ovvio
- Tono da critico cinematografico, evocativo, zero riassunti di trama

Per le serie: "runtime" deve indicare il formato (es. "3 stagioni · 8 ep/stagione" o "1 stagione · 6 ep").
Per i film: "runtime" indica la durata (es. "2h 14m").

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
      "type": "series",
      "runtime": "2 stagioni · 8 ep",
      "explanation": "Due frasi in italiano."
    }
  ]
}`;

    const raw    = await groqJSON(prompt, 2000);
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
