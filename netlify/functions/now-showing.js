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

function scoreCandidate(film, preferredIds) {
  let score = 0;
  for (const gid of (film.genre_ids || [])) {
    if (preferredIds.has(gid)) score += 1;
  }
  // Boost by vote average (normalised to 0-1 range)
  score += (film.vote_average || 0) / 10;
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

    // 30 days ago date string for TMDB filtering
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    // Fetch in parallel: now playing (cinema) + recent releases (streaming)
    // No region filter — broader pool, avoids empty results for niche regions
    const [cinemaData, recentData] = await Promise.all([
      tmdbFetch('/movie/now_playing?page=1'),
      tmdbFetch(`/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${cutoff}&primary_release_date.lte=${today}&vote_count.gte=5&page=1`),
    ]);

    const cinemaPool  = (cinemaData.results  || []).slice(0, 15);
    const recentPool  = (recentData.results  || []).slice(0, 15);

    // Score each candidate
    const scoredCinema = cinemaPool
      .map(f => ({ ...f, _score: scoreCandidate(f, preferredIds) }))
      .sort((a, b) => b._score - a._score);

    // Remove from recent those already in cinemaPool
    const cinemaIds = new Set(cinemaPool.map(f => f.id));
    const scoredRecent = recentPool
      .filter(f => !cinemaIds.has(f.id))
      .map(f => ({ ...f, _score: scoreCandidate(f, preferredIds) }))
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
