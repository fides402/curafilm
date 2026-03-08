import { useState } from 'react';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

export default function RecommendationCard({ rec, index }) {
  const [imgFailed, setImgFailed] = useState(false);
  const poster = rec.poster_path && !imgFailed ? `${TMDB_IMG}${rec.poster_path}` : null;
  const num = String(index + 1).padStart(2, '0');

  return (
    <article className="card" style={{ animationDelay: `${index * 0.15}s` }}>
      <div className="card-index">{num}</div>

      {poster ? (
        <img
          className="card-poster"
          src={poster}
          alt={rec.title}
          loading="eager"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="card-poster card-poster--empty">
          <span>{rec.title?.[0] || '?'}</span>
        </div>
      )}

      <div className="card-main">
        <h3 className="card-title">
          {rec.title}
          {rec.type === 'series' && (
            <span className="card-type-badge">serie</span>
          )}
        </h3>
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
        <p className="card-explanation">{rec.explanation}</p>
      </div>
    </article>
  );
}
