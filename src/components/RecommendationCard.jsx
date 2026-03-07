const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

export default function RecommendationCard({ rec, index }) {
  const poster = rec.poster_path ? `${TMDB_IMG}${rec.poster_path}` : null;
  const num = String(index + 1).padStart(2, '0');

  return (
    <article className="card" style={{ animationDelay: `${index * 0.15}s` }}>
      <div className="card-index">{num}</div>

      <div className="card-main">
        <div className="card-top">
          <div className="card-identity">
            <h3 className="card-title">{rec.title}</h3>
            <div className="card-meta">
              {rec.year && <span>{rec.year}</span>}
              {rec.director && (
                <>
                  <span className="meta-dot">·</span>
                  <span className="card-director">{rec.director}</span>
                </>
              )}
              {rec.runtime && (
                <>
                  <span className="meta-dot">·</span>
                  <span>{rec.runtime}</span>
                </>
              )}
            </div>
          </div>

          {poster ? (
            <img
              className="card-poster"
              src={poster}
              alt={rec.title}
              loading="lazy"
            />
          ) : (
            <div className="card-poster card-poster--empty">
              <span>{rec.title?.[0] || '?'}</span>
            </div>
          )}
        </div>

        <p className="card-explanation">{rec.explanation}</p>
      </div>
    </article>
  );
}
