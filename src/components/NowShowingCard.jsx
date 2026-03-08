import { useState } from 'react';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

const VENUE_LABEL = {
  cinema:    '▶ al cinema',
  streaming: '▶ in streaming',
};

export default function NowShowingCard({ film }) {
  const [imgFailed, setImgFailed] = useState(false);
  const poster = film.poster_path && !imgFailed ? `${TMDB_IMG}${film.poster_path}` : null;

  return (
    <article className="now-card">
      {poster ? (
        <img
          className="now-card-poster"
          src={poster}
          alt={film.title}
          loading="eager"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="now-card-poster now-card-poster--empty">
          <span>{film.title?.[0] || '?'}</span>
        </div>
      )}

      <div className="now-card-body">
        <span className="now-card-venue">{VENUE_LABEL[film.venue] || film.venue}</span>
        <h4 className="now-card-title">{film.title}</h4>
        <div className="now-card-meta">
          {film.year && <span>{film.year}</span>}
          {film.genres?.length > 0 && (
            <>
              <span className="meta-dot">·</span>
              <span>{film.genres.slice(0, 2).join(', ')}</span>
            </>
          )}
          {film.vote && (
            <>
              <span className="meta-dot">·</span>
              <span>★ {film.vote}</span>
            </>
          )}
        </div>
        {film.overview && (
          <p className="now-card-overview">{film.overview}</p>
        )}
      </div>
    </article>
  );
}
