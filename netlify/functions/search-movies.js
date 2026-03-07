const TMDB_KEY = process.env.TMDB_API_KEY || '85395f1f04d886e7ad3581f64d886026';
const TMDB_BASE = 'https://api.themoviedb.org/3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function tmdbSearch(query) {
  // No language param → finds original + Italian titles
  const res = await fetch(
    `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&include_adult=false`
  );
  const data = await res.json();
  return data.results?.find((r) => r.media_type === 'movie' || r.media_type === 'tv') || null;
}

async function fetchDetails(item) {
  const type = item.media_type;
  const res = await fetch(
    `${TMDB_BASE}/${type}/${item.id}?api_key=${TMDB_KEY}&language=en-US&append_to_response=credits,keywords`
  );
  const d = await res.json();

  const director =
    type === 'movie'
      ? d.credits?.crew?.find((c) => c.job === 'Director')?.name || ''
      : d.created_by?.[0]?.name || '';

  const keywords = (d.keywords?.keywords || d.keywords?.results || [])
    .slice(0, 8)
    .map((k) => k.name);

  let runtime = null;
  if (type === 'movie' && d.runtime) {
    runtime = `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m`;
  } else if (type === 'tv' && d.episode_run_time?.[0]) {
    runtime = `~${d.episode_run_time[0]}m / ep`;
  }

  return {
    id: item.id,
    type,
    title: d.title || d.name,
    year: (d.release_date || d.first_air_date || '').substring(0, 4),
    director,
    genres: d.genres?.map((g) => g.name) || [],
    keywords,
    overview: (d.overview || '').substring(0, 300),
    vote_average: d.vote_average || null,
    poster_path: d.poster_path || null,
    runtime,
  };
}

async function searchOne(inputTitle) {
  try {
    let item = await tmdbSearch(inputTitle);

    // Fallback: strip Italian/English leading article
    if (!item) {
      const stripped = inputTitle.replace(
        /^(il|la|lo|gli|le|i|un|una|uno|the|a|an)\s+/i,
        ''
      );
      if (stripped !== inputTitle) item = await tmdbSearch(stripped);
    }

    if (!item) return { inputTitle, found: false, data: null };

    const data = await fetchDetails(item);
    return { inputTitle, found: true, data };
  } catch {
    return { inputTitle, found: false, data: null };
  }
}

async function batchProcess(titles, size = 5, delayMs = 250) {
  const results = [];
  for (let i = 0; i < titles.length; i += size) {
    const batch = titles.slice(i, i + size);
    const batchResults = await Promise.all(batch.map(searchOne));
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

    // Returns ordered array with found/not-found per title
    const results = await batchProcess(cleaned);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(results),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'errore interno: ' + err.message }),
    };
  }
};
