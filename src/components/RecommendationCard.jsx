const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

export default function RecommendationCard({ rec, index }) {
  const poster = rec.poster_path ? `${TMDB_IMG}${rec.poster_path}` : null;

  return (
    <article
      className="card"
      style={{ animationDelay: `${index * 0.18}s` }}
    >
      {poster ? (
        <div className="card-poster">
          <img src={poster} alt={rec.title} loading="lazy" />
        </div>
      ) : (
        <div className="card-poster card-poster--empty">
          <span className="poster-placeholder">
            {rec.title?.[0] || '?'}
          </span>
        </div>
      )}

      <div className="card-body">
        <div className="card-top">
          <h3 className="card-title">{rec.title}</h3>
          <span className="card-year">{rec.year}</span>
        </div>

        <div className="card-meta">
          {rec.director && (
            <span className="card-director">regia di {rec.director}</span>
          )}
          {rec.runtime && (
            <span className="card-runtime">{rec.runtime}</span>
          )}
        </div>

        <p className="card-explanation">{rec.explanation}</p>
      </div>
    </article>
  );
}
