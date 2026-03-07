const TMDB_IMG = 'https://image.tmdb.org/t/p/w92';

export default function ProfilePage({ profile, onClose, onReset, onExport }) {
  const movies = profile.filter((m) => m.type === 'movie');
  const series = profile.filter((m) => m.type === 'tv');

  return (
    <div className="screen profile-page">
      <div className="profile-inner">
        <div className="profile-header">
          <div>
            <h2 className="profile-title">il tuo profilo</h2>
            <p className="profile-sub">
              {profile.length} {profile.length === 1 ? 'titolo salvato' : 'titoli salvati'}
              {movies.length > 0 && series.length > 0 && (
                <> · {movies.length} film, {series.length} serie</>
              )}
            </p>
          </div>
          <button className="btn-icon-close" onClick={onClose} aria-label="chiudi">
            ×
          </button>
        </div>

        <div className="profile-grid">
          {profile.map((m) => (
            <div key={m.id} className="profile-movie">
              {m.poster_path ? (
                <img
                  src={`${TMDB_IMG}${m.poster_path}`}
                  alt={m.title}
                  className="profile-movie-poster"
                  loading="lazy"
                />
              ) : (
                <div className="profile-movie-poster profile-movie-poster--empty">
                  {m.title?.[0]}
                </div>
              )}
              <div className="profile-movie-info">
                <span className="profile-movie-title">{m.title}</span>
                <span className="profile-movie-year">{m.year}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="profile-actions">
          <button className="btn-secondary" onClick={onExport}>
            esporta JSON
          </button>
          <button className="btn-danger" onClick={onReset}>
            cambia profilo
          </button>
        </div>
      </div>
    </div>
  );
}
