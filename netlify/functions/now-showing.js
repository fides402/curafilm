// Shows films currently in cinema + released in the last 30 days (streaming),
// filtered by genre overlap with the user's taste profile.

const TMDB_KEY  = process.env.TMDB_API_KEY || '85395f1f04d886e7ad3581f64d886026';
const TMDB_BASE = 'https://api.themoviedb.org/3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// TMDB genre ID → canonical name mapping
const GENRE_ID_MAP = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
  53: 'Thriller', 10752: 'War', 37: 'Western',
};

// Map genre name variations → TMDB IDs
const GENRE_NAME_TO_ID = {
  horror: 27, thriller: 53, drama: 18, crime: 80, action: 28,
  'science fiction': 878, 'sci-fi': 878, mystery: 9648, animation: 16,
  documentary: 99, fantasy: 14, adventure: 12, comedy: 35,
  romance: 10749, history: 36, war: 10752, western: 37,
};

// Build a set of preferred TMDB genre IDs from profile films + tasteVector
function buildPreferredGenreIds(profile, dominantGenres) {
  const counts = {};

  // Count genres from TMDB-enriched profile films
  if (Array.isArray(profile)) {
    for (const film of profile) {
      for (const g of (film.genres || [])) {
        const key = g.toLowerCase();
        counts[key] = (counts[key] || 0) + 2; // weight 2: explicit profile
      }
    }
  }

  // Boost from structural analysis dominant genres
  if (Array.isArray(dominantGenres)) {
    for (const dg of dominantGenres) {
      const lower = dg.toLowerCase();
      for (const [name] of Object.entries(GENRE_NAME_TO_ID)) {
        if (lower.includes(name)) {
          counts[name] = (counts[name] || 0) + 3; // weight 3: deep analysis
        }
      }
    }
  }

  // Map names to TMDB genre IDs, keep top 5 by weight
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const ids = new Set();
  for (const [name] of sorted) {
    const id = GENRE_NAME_TO_ID[name];
    if (id) ids.add(id);
    if (ids.size >= 5) break;
  }

  // Fallback: include Drama + Thriller if nothing found
  if (ids.size === 0) { ids.add(18); ids.add(53); }
  return ids;
}

// IDs generi da evitare se non presenti nel profilo utente (generi "commerciali" di default)
const COMMERCIAL_GENRE_IDS = new Set([28, 12, 16, 10751, 14, 10749]); // Action, Adventure, Animation, Family, Fantasy, Romance

function scoreCandidate(film, preferredIds, avoidGenreIds) {
  const genres = film.genre_ids || [];

  // Scarta completamente se contiene genere esplicitamente da evitare
  if (avoidGenreIds && genres.some(g => avoidGenreIds.has(g))) return -Infinity;

  let score = 0;

  // Bonus per ogni genere preferito presente
  for (const gid of genres) {
    if (preferredIds.has(gid)) score += 1.5;
  }

  // Penalizza generi puramente commerciali non nel profilo utente
  for (const gid of genres) {
    if (COMMERCIAL_GENRE_IDS.has(gid) && !preferredIds.has(gid)) score -= 0.8;
  }

  // Qualità: bonus per voto alto (sopra 6.5 significativo)
  const vote = film.vote_average || 0;
  if (vote >= 6.5) score += (vote - 6.5) * 0.4;

  // Penalità popolarità: film molto popolari sono spesso blockbuster
  // popularity > 80 è mainstream, > 200 è blockbuster globale
  const pop = film.popularity || 0;
  score -= Math.min(pop, 300) / 300 * 1.2;

  return score;
}

async function tmdbFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${TMDB_KEY}&language=it-IT`);
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
  return res.json();
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: '' };

  try {
    const { profile, tasteVector } = JSON.parse(event.body || '{}');

    const preferredIds = buildPreferredGenreIds(profile, tasteVector?.dominantGenres);

    // Costruisci set di generi da evitare da avoidTraits
    const avoidGenreIds = new Set();
    if (Array.isArray(tasteVector?.avoidTraits)) {
      for (const trait of tasteVector.avoidTraits) {
        const lower = trait.toLowerCase();
        for (const [name, id] of Object.entries(GENRE_NAME_TO_ID)) {
          if (lower.includes(name)) avoidGenreIds.add(id);
        }
      }
    }

    // 45 days ago for streaming (slightly wider window)
    const cutoffStream = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const cutoffCinema = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    // Fetch in parallel: now playing (2 pages = più pool) + recent quality releases
    const [cinemaData, cinema2, recentData] = await Promise.all([
      tmdbFetch(`/movie/now_playing?page=1`),
      tmdbFetch(`/movie/now_playing?page=2`),
      // Sort by release date desc + quality filter: no blockbuster bias
      tmdbFetch(`/discover/movie?sort_by=primary_release_date.desc&primary_release_date.gte=${cutoffStream}&primary_release_date.lte=${today}&vote_count.gte=10&vote_average.gte=6.0&page=1`),
    ]);

    // Combina le 2 pagine cinema, deduplicando
    const seenIds = new Set();
    const cinemaPool = [...(cinemaData.results || []), ...(cinema2.results || [])]
      .filter(f => { if (seenIds.has(f.id)) return false; seenIds.add(f.id); return true; })
      // Solo film con uscita entro 60 giorni (evita vecchi film ancora in sala)
      .filter(f => !f.release_date || f.release_date >= cutoffCinema);

    const recentPool = (recentData.results || []);

    // Score each candidate
    const scoredCinema = cinemaPool
      .map(f => ({ ...f, _score: scoreCandidate(f, preferredIds, avoidGenreIds) }))
      .filter(f => f._score > -Infinity)
      .sort((a, b) => b._score - a._score);

    // Remove from recent those already in cinemaPool
    const cinemaIdSet = new Set(cinemaPool.map(f => f.id));
    const scoredRecent = recentPool
      .filter(f => !cinemaIdSet.has(f.id))
      .map(f => ({ ...f, _score: scoreCandidate(f, preferredIds, avoidGenreIds) }))
      .filter(f => f._score > -Infinity)
      .sort((a, b) => b._score - a._score);

    const toCard = (f, venue) => ({
      tmdb_id:    f.id,
      title:      f.title,
      year:       f.release_date?.slice(0, 4) || '',
      poster_path: f.poster_path || null,
      overview:   f.overview || '',
      vote:       f.vote_average ? f.vote_average.toFixed(1) : null,
      genres:     (f.genre_ids || []).map(id => GENRE_ID_MAP[id]).filter(Boolean),
      venue,      // 'cinema' | 'streaming'
    });

    const cinema   = scoredCinema.slice(0, 2).map(f => toCard(f, 'cinema'));
    const streaming = scoredRecent.slice(0, 2).map(f => toCard(f, 'streaming'));

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ cinema, streaming }),
    };
  } catch (err) {
    console.error('now-showing error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
