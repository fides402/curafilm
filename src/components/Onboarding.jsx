import { useState } from 'react';

const PLACEHOLDER = `The Shining
Perfect Days
Mulholland Drive
Parasite
The Sopranos
Lost in Translation
Blade Runner 2049
Twin Peaks
There Will Be Blood
...`;

function ReviewItem({ result, onRemove }) {
  if (result.found) {
    const { data } = result;
    return (
      <div className="review-item review-item--found">
        {data.poster_path ? (
          <img
            className="review-poster"
            src={`https://image.tmdb.org/t/p/w92${data.poster_path}`}
            alt={data.title}
          />
        ) : (
          <div className="review-poster review-poster--empty">
            {data.title?.[0]}
          </div>
        )}
        <div className="review-info">
          <span className="review-title">{data.title}</span>
          <span className="review-meta">
            {data.year}
            {data.director ? ` · ${data.director}` : ''}
          </span>
        </div>
        <span className="review-badge found">✓</span>
        <button className="review-remove" onClick={onRemove} title="rimuovi">
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="review-item review-item--not-found">
      <div className="review-poster review-poster--empty review-poster--miss">?</div>
      <div className="review-info">
        <span className="review-title">{result.inputTitle}</span>
        <span className="review-meta not-found-label">non trovato su TMDB</span>
      </div>
      <span className="review-badge miss">✗</span>
      <button className="review-remove" onClick={onRemove} title="rimuovi">
        ×
      </button>
    </div>
  );
}

export default function Onboarding({ onProfileBuilt }) {
  const [phase, setPhase] = useState('input'); // 'input' | 'review'
  const [input, setInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const titles = input
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  const count = titles.length;
  const tooFew = count > 0 && count < 5;
  const tooMany = count > 25;
  const canSearch = count >= 5 && count <= 25;

  const foundCount = searchResults.filter((r) => r.found).length;
  const canSave = foundCount >= 3;

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/search-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSearchResults(data);
      setPhase('review');
    } catch (err) {
      setError(err.message || 'errore di connessione. riprova.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (index) => {
    setSearchResults((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const profile = searchResults.filter((r) => r.found).map((r) => r.data);
    onProfileBuilt(profile);
  };

  const handleBack = () => {
    setPhase('input');
    setError('');
  };

  // ── REVIEW PHASE ──────────────────────────────────
  if (phase === 'review') {
    return (
      <div className="screen onboarding">
        <div className="onboarding-inner">
          <div className="onboarding-hero">
            <h1 className="brand-title">curafilm</h1>
            <p className="brand-sub">controlla il tuo profilo narrativo</p>
          </div>

          <div className="review-summary">
            <span className="summary-found">{foundCount} trovati</span>
            {searchResults.filter((r) => !r.found).length > 0 && (
              <span className="summary-miss">
                · {searchResults.filter((r) => !r.found).length} non trovati
              </span>
            )}
            <span className="summary-hint">
              (puoi rimuovere quelli sbagliati)
            </span>
          </div>

          <div className="review-list">
            {searchResults.map((result, i) => (
              <ReviewItem
                key={i}
                result={result}
                onRemove={() => handleRemove(i)}
              />
            ))}
          </div>

          {!canSave && (
            <p className="msg error">
              servono almeno 3 film trovati per costruire il profilo.
            </p>
          )}

          <div className="review-actions">
            <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
              salva profilo
            </button>
            <button className="btn-ghost" onClick={handleBack}>
              ← modifica lista
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── INPUT PHASE ───────────────────────────────────
  return (
    <div className="screen onboarding">
      <div className="onboarding-inner">
        <div className="onboarding-hero">
          <h1 className="brand-title">curafilm</h1>
          <p className="brand-sub">il tuo sistema curatoriale personale</p>
        </div>

        <div className="form-block">
          <label className="form-label">
            quali film e serie ami?
            <span className="form-hint">
              uno per riga &nbsp;·&nbsp; da 5 a 25 titoli
            </span>
          </label>

          <textarea
            className={`textarea${loading ? ' disabled' : ''}`}
            placeholder={PLACEHOLDER}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError('');
            }}
            rows={12}
            disabled={loading}
          />

          <div className="form-footer">
            <span
              className={`count-badge${tooFew ? ' warn' : tooMany ? ' bad' : canSearch ? ' ok' : ''}`}
            >
              {count} {count === 1 ? 'titolo' : 'titoli'}
              {tooFew && ' — aggiungi almeno 5'}
              {tooMany && ' — massimo 25'}
            </span>
          </div>

          {error && <p className="msg error">{error}</p>}

          <button
            className="btn-primary full"
            onClick={handleSearch}
            disabled={!canSearch || loading}
          >
            {loading ? (
              <span className="btn-loading">
                <span className="btn-dots">
                  <span /><span /><span />
                </span>
                cerco su TMDB…
              </span>
            ) : (
              'cerca i miei film →'
            )}
          </button>

          <p className="form-note">
            il profilo viene salvato nel browser e puoi esportarlo come JSON.
            nessun account richiesto.
          </p>
        </div>
      </div>
    </div>
  );
}
