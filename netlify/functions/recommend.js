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

// ── Hard exclusion filter ─────────────────────────────────────────────────────
function passesHardFilter(t) {
  return (
    t.humor_gag_score      <= 0.42 &&
    t.premise_strength     >= 0.65 &&
    t.first_10_min_hook    >= 0.62 &&
    t.directorial_identity >= 0.52 &&
    t.genericness_penalty  <= 0.52
  );
}

// ── Score a single title against taste vector + mood vector ──────────────────
function scoreTitle(t, tv, mv) {
  const g = (key, fallback = 0.70) => tv[key] ?? fallback;

  // Base compatibility (weighted dot-product style)
  const base = (
    0.97 * t.premise_strength                                         +
    0.95 * t.mystery_density       * g('mystery_need')               +
    0.94 * t.first_10_min_hook     * g('first_10_min_hook_need')     +
    0.91 * t.narrative_tension     * g('tension_affinity')           +
    0.87 * t.directorial_identity  * g('directorial_identity_need')  +
    0.82 * t.atmosphere_strength   * g('atmosphere_importance')      -
    0.88 * t.humor_gag_score       * g('comedy_penalty')             -
    0.93 * t.genericness_penalty   * g('banality_penalty')
  ) / 6.5;

  // Mood alignment (1 - mean absolute deviation)
  const m = (key, fallback = 0.50) => mv[key] ?? fallback;
  const moodAlign = 1 - (
    Math.abs(t.mystery_density         - m('desired_mystery'))           +
    Math.abs(t.narrative_tension       - m('desired_tension'))           +
    Math.abs(t.contemplative_immersion - m('desired_contemplation'))     +
    Math.abs(t.world_building_depth    - m('desired_world_exploration')) +
    Math.abs(t.first_10_min_hook       - m('desired_hook_speed'))
  ) / 5;

  const confidence = base * 0.60 + moodAlign * 0.40;
  return { ...t, base_score: base, mood_align: moodAlign, confidence };
}

// ── Greedy diverse selection ──────────────────────────────────────────────────
function selectDiverse(pool, n) {
  const FEAT = ['mystery_density', 'narrative_tension', 'contemplative_immersion', 'world_building_depth', 'first_10_min_hook'];
  const selected = [];
  const remaining = [...pool];

  while (selected.length < n && remaining.length > 0) {
    let bestScore = -Infinity, bestIdx = 0;
    remaining.forEach((t, i) => {
      const diversity = selected.length === 0
        ? 1
        : Math.min(...selected.map(s =>
            FEAT.reduce((sum, k) => sum + Math.abs((t[k] || 0) - (s[k] || 0)), 0) / FEAT.length
          ));
      const score = 0.75 * t.confidence + 0.25 * diversity;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  return selected;
}

// ── TMDB poster ───────────────────────────────────────────────────────────────
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

// ── Groq helper ───────────────────────────────────────────────────────────────
async function groqCall(prompt, temperature, max_tokens) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };

  try {
    const { profile, tasteVector, mood, moodVector } = JSON.parse(event.body || '{}');

    if (!Array.isArray(profile) || !profile.length) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'profilo mancante' }) };
    }
    if (!moodVector || !mood) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'mood mancante' }) };
    }

    const tv = tasteVector || {};
    const mv = moodVector;
    const excludedTitles = profile.map(m => `"${m.title}"`).join(', ');
    const profileSummary = profile.slice(0, 10).map(m =>
      `• "${m.title}" (${m.year}) dir. ${m.director}`
    ).join('\n');

    // ── PHASE 1: Generate candidate pool with feature vectors ─────────────────
    const phase1Prompt = `You are a curatorial AI with encyclopedic knowledge of world cinema.

USER TASTE PROFILE (latent vector — what they deeply value):
${JSON.stringify(tv, null, 2)}

TONIGHT'S MOOD VECTOR (what they want RIGHT NOW):
${JSON.stringify(mv, null, 2)}

MOOD LABEL: "${mood}"

SEEN FILMS — DO NOT include any of these:
${excludedTitles}

SAMPLE OF THEIR TASTE (cultural fluency context only):
${profileSummary}

TASK: Generate exactly 24 candidate film/series titles — do NOT include titles from the seen list.
- 14 classics (year ≤ 2018): varied eras, directors, countries, artistic range
- 10 recent (year ≥ 2019): include titles from 2022-2025
- Mix: thriller, sci-fi, noir, drama, horror, auteur, mystery — NO pure comedy
- Vary directors and countries heavily — no director appearing twice
- Avoid commercial blockbusters without artistic identity
- Include lesser-known gems alongside recognized titles
- All titles must actually exist and be real productions

For EACH title, provide accurate feature scores (0.00–1.00) based on your film knowledge:
- premise_strength: originality and strength of the narrative premise
- mystery_density: pervasive mystery/enigma in the viewing experience
- narrative_tension: sustained forward pull and plot tension
- first_10_min_hook: how strongly the opening grabs attention
- directorial_identity: strong recognizable directorial authorship
- atmosphere_strength: atmospheric density and immersive quality
- contemplative_immersion: slow/contemplative quality (high = slow, low = fast-paced)
- world_building_depth: richness of the world constructed
- authorial_weight: overall authorial coherence and weight
- humor_gag_score: comedy/gag presence (low is better for this user)
- genericness_penalty: how generic/conventional (low is better)

Return ONLY valid JSON, no markdown, no explanation:
{
  "classics": [
    {
      "title": "Exact Title",
      "year": "YYYY",
      "director": "Full Name",
      "type": "movie",
      "runtime": "Xh Xm",
      "premise_strength": 0.00,
      "mystery_density": 0.00,
      "narrative_tension": 0.00,
      "first_10_min_hook": 0.00,
      "directorial_identity": 0.00,
      "atmosphere_strength": 0.00,
      "contemplative_immersion": 0.00,
      "world_building_depth": 0.00,
      "authorial_weight": 0.00,
      "humor_gag_score": 0.00,
      "genericness_penalty": 0.00
    }
  ],
  "recent": [ ... same structure ... ]
}`;

    const phase1Raw = await groqCall(phase1Prompt, 0.45, 4000);
    const phase1Match = phase1Raw.match(/\{[\s\S]*\}/);
    if (!phase1Match) throw new Error('candidate generation failed — no JSON in response');
    const candidates = JSON.parse(phase1Match[0]);

    const allCandidates = [
      ...(Array.isArray(candidates.classics) ? candidates.classics : []).map(c => ({ ...c, era: 'classic' })),
      ...(Array.isArray(candidates.recent)   ? candidates.recent   : []).map(c => ({ ...c, era: 'recent'  })),
    ];

    // ── PHASE 2: Hard filter → score → confidence gate → diverse select ───────
    const filtered = allCandidates.filter(passesHardFilter);
    const scored   = filtered.map(t => scoreTitle(t, tv, mv));

    // Partition by era
    const classicsPool = scored.filter(t => t.era === 'classic' || parseInt(t.year) < 2019);
    const recentPool   = scored.filter(t => t.era === 'recent'  || parseInt(t.year) >= 2019);

    // Confidence gate (relax if too few survive)
    const CONF_THRESHOLD = 0.70;
    const gate = (pool) => {
      const gated = pool.filter(t => t.confidence >= CONF_THRESHOLD);
      return gated.length >= 3 ? gated : [...pool].sort((a, b) => b.confidence - a.confidence);
    };

    const selectedClassics = selectDiverse(gate(classicsPool), 3);
    const selectedRecent   = selectDiverse(gate(recentPool),   3);

    if (selectedClassics.length === 0 && selectedRecent.length === 0) {
      throw new Error('nessun candidato valido dopo il filtro');
    }

    // ── PHASE 3: Write Italian explanations for selected titles ───────────────
    const selectedJson = JSON.stringify(
      [...selectedClassics, ...selectedRecent].map(t => ({
        title: t.title, year: t.year, director: t.director,
        type: t.type, runtime: t.runtime, era: t.era,
        confidence: t.confidence?.toFixed(2),
        features: {
          premise: t.premise_strength, mystery: t.mystery_density,
          tension: t.narrative_tension, hook: t.first_10_min_hook,
          atmosphere: t.atmosphere_strength, contemplation: t.contemplative_immersion,
        },
      })),
      null, 2
    );

    const phase3Prompt = `You are an Italian film curator. Write concise explanations for these recommended titles.

USER MOOD TONIGHT: "${mood}"
TASTE VECTOR: ${JSON.stringify(tv)}

SELECTED TITLES:
${selectedJson}

For each title write a 2-sentence "explanation" in Italian:
- Sentence 1: why it perfectly matches tonight's mood and the user's taste profile
- Sentence 2: one specific atmospheric/narrative element that makes it distinctive and non-obvious
- No spoilers. Evocative tone, not didactic. No plot summary.

Return ONLY valid JSON:
{
  "classics": [
    { "title": "...", "year": "...", "director": "...", "runtime": "...", "explanation": "Due frasi in italiano." }
  ],
  "recent": [
    { "title": "...", "year": "...", "director": "...", "runtime": "...", "explanation": "Due frasi in italiano." }
  ]
}`;

    const phase3Raw = await groqCall(phase3Prompt, 0.55, 1400);
    const phase3Match = phase3Raw.match(/\{[\s\S]*\}/);
    if (!phase3Match) throw new Error('explanation generation failed');
    const explained = JSON.parse(phase3Match[0]);

    const classics_final = Array.isArray(explained.classics) ? explained.classics.slice(0, 3) : selectedClassics.slice(0, 3);
    const recent_final   = Array.isArray(explained.recent)   ? explained.recent.slice(0, 3)   : selectedRecent.slice(0, 3);

    // ── TMDB poster enrichment ────────────────────────────────────────────────
    const enrich = (list) =>
      Promise.all(list.map(async (rec) => {
        const tmdb = await fetchPoster(rec.title, rec.year);
        return { ...rec, ...tmdb };
      }));

    const [enrichedClassics, enrichedRecent] = await Promise.all([
      enrich(classics_final),
      enrich(recent_final),
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
