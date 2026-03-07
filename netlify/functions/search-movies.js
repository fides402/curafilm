const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function searchAndFetch(title) {
  try {
    const searchRes = await fetch(
      `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}&language=en-US&include_adult=false`
    );
    const searchData = await searchRes.json();
    const item = searchData.results?.find(
      (r) => r.media_type === 'movie' || r.media_type === 'tv'
    );
    if (!item) return null;

    const type = item.media_type;
    const detailRes = await fetch(
      `${TMDB_BASE}/${type}/${item.id}?api_key=${TMDB_KEY}&language=en-US&append_to_response=credits,keywords`
    );
    const d = await detailRes.json();

    const director =
      type === 'movie'
        ? d.credits?.crew?.find((c) => c.job === 'Director')?.name || ''
        : d.created_by?.[0]?.name || '';

    const keywords =
      (d.keywords?.keywords || d.keywords?.results || [])
        .slice(0, 8)
        .map((k) => k.name);

    const runtime =
      type === 'movie'
        ? d.runtime
          ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m`
          : null
        : d.episode_run_time?.[0]
        ? `~${d.episode_run_time[0]}m / ep`
        : null;

    return {
      id: item.id,
      type,
      title: d.title || d.name || title,
      year: (d.release_date || d.first_air_date || '').substring(0, 4),
      director,
      genres: d.genres?.map((g) => g.name) || [],
      keywords,
      overview: (d.overview || '').substring(0, 300),
      vote_average: d.vote_average,
      poster_path: d.poster_path || null,
      runtime,
    };
  } catch {
    return null;
  }
}

async function batchProcess(titles, size = 5, delayMs = 300) {
  const results = [];
  for (let i = 0; i < titles.length; i += size) {
    const batch = titles.slice(i, i + size);
    const batchResults = await Promise.all(batch.map(searchAndFetch));
    results.push(...batchResults);
    if (i + size < titles.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    const { titles } = JSON.parse(event.body || '{}');
    if (!Array.isArray(titles) || titles.length === 0) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'titoli mancanti' }),
      };
    }

    const cleaned = titles
      .map((t) => String(t).trim())
      .filter((t) => t.length > 0)
      .slice(0, 25);

    const results = await batchProcess(cleaned);
    const valid = results.filter(Boolean);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(valid),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'errore interno: ' + err.message }),
    };
  }
};
