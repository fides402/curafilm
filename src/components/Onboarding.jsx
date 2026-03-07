import { useState, useRef, useCallback } from 'react';

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

// ── CSV helpers ────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseLetterboxdCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const nameIdx   = headers.indexOf('name');
  const yearIdx   = headers.indexOf('year');
  const ratingIdx = headers.indexOf('rating');

  if (nameIdx === -1 || yearIdx === -1) return null;

  const films = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols   = parseCSVLine(lines[i]);
    const title  = cols[nameIdx]?.trim();
    const year   = cols[yearIdx]?.trim();
    const rStr   = ratingIdx !== -1 ? cols[ratingIdx]?.trim() : '';
    const rating = rStr ? parseFloat(rStr) : null;
    if (title && year) films.push({ title, year, rating: isNaN(rating) ? null : rating });
  }
  return films.length > 0 ? films : null;
}

// Sort by rating desc (nulls last), then keep insertion order
function selectTopTitles(films, n = 25) {
  return [...films]
    .sort((a, b) => {
      if (a.rating !== null && b.rating !== null) return b.rating - a.rating;
      if (a.rating !== null) return -1;
      if (b.rating !== null) return 1;
      return 0;
    })
    .slice(0, n)
    .map(f => f.title);
}

// ── ReviewItem ─────────────────────────────────────────────────────────────────
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
        <button className="review-remove" onClick={onRemove} title="rimuovi">×</button>
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
      <button className="review-remove" onClick={onRemove} title="rimuovi">×</button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Onboarding({ onProfileBuilt }) {
  const [phase, setPhase]             = useState('input'); // 'input' | 'review'
  const [importMode, setImportMode]   = useState('manual'); // 'manual' | 'letterboxd'
  const [input, setInput]             = useState('');
  const [parsedFilms, setParsedFilms] = useState(null); // all films from CSV
  const [parseError, setParseError]   = useState('');
  const [isDragging, setIsDragging]   = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const fileInputRef = useRef(null);

  // ── manual mode helpers ──
  const titles   = input.split('\n').map(t => t.trim()).filter(Boolean);
  const count    = titles.length;
  const tooFew   = count > 0 && count < 5;
  const tooMany  = count > 25;
  const canSearch = importMode === 'letterboxd'
    ? parsedFilms !== null
    : (count >= 5 && count <= 25);

  const foundCount = searchResults.filter(r => r.found).length;
  const canSave    = foundCount >= 3;

  // ── file parsing ──
  const handleFile = useCallback((file) => {
    if (!file) return;
    setParseError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const films = parseLetterboxdCSV(e.target.result);
      if (!films) {
        setParseError('file non riconosciuto. usa diary.csv, watched.csv o ratings.csv da Letterboxd.');
        setParsedFilms(null);
      } else {
        setParsedFilms(films);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) handleFile(file);
    else setParseError('carica un file .csv');
  };

  const hasRatings = parsedFilms?.some(f => f.rating !== null);

  // ── TMDB search ──
  const handleSearch = async () => {
    setLoading(true);
    setError('');
    const searchTitles = importMode === 'letterboxd'
      ? selectTopTitles(parsedFilms, 25)
      : titles;

    try {
      const res = await fetch('/api/search-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles: searchTitles }),
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
    setSearchResults(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const profile = searchResults.filter(r => r.found).map(r => r.data);
    // Pass all raw Letterboxd titles for exclusion in recommendations
    const watchedTitles = parsedFilms
      ? parsedFilms.map(f => ({ title: f.title, year: f.year }))
      : null;
    onProfileBuilt(profile, watchedTitles);
  };

  const handleBack = () => {
    setPhase('input');
    setError('');
  };

  const switchMode = (mode) => {
    setImportMode(mode);
    setError('');
    setParseError('');
  };

  // ── REVIEW PHASE ──────────────────────────────────────────────────────────────
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
            {searchResults.filter(r => !r.found).length > 0 && (
              <span className="summary-miss">
                · {searchResults.filter(r => !r.found).length} non trovati
              </span>
            )}
            {parsedFilms && (
              <span className="summary-hint">
                · {parsedFilms.length.toLocaleString('it')} film importati da Letterboxd
              </span>
            )}
            {!parsedFilms && (
              <span className="summary-hint">(puoi rimuovere quelli sbagliati)</span>
            )}
          </div>

          <div className="review-list">
            {searchResults.map((result, i) => (
              <ReviewItem key={i} result={result} onRemove={() => handleRemove(i)} />
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

  // ── INPUT PHASE ───────────────────────────────────────────────────────────────
  return (
    <div className="screen onboarding">
      <div className="onboarding-inner">
        <div className="onboarding-hero">
          <h1 className="brand-title">curafilm</h1>
          <p className="brand-sub">il tuo sistema curatoriale personale</p>
        </div>

        {/* Mode tabs */}
        <div className="input-tabs">
          <button
            className={`tab-btn${importMode === 'manual' ? ' tab-btn--active' : ''}`}
            onClick={() => switchMode('manual')}
          >
            scrivi manualmente
          </button>
          <button
            className={`tab-btn${importMode === 'letterboxd' ? ' tab-btn--active' : ''}`}
            onClick={() => switchMode('letterboxd')}
          >
            importa da Letterboxd
          </button>
        </div>

        {/* ── MANUAL TAB ── */}
        {importMode === 'manual' && (
          <div className="form-block">
            <label className="form-label">
              quali film e serie ami?
              <span className="form-hint">uno per riga &nbsp;·&nbsp; da 5 a 25 titoli</span>
            </label>

            <textarea
              className={`textarea${loading ? ' disabled' : ''}`}
              placeholder={PLACEHOLDER}
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(''); }}
              rows={12}
              disabled={loading}
            />

            <div className="form-footer">
              <span className={`count-badge${tooFew ? ' warn' : tooMany ? ' bad' : canSearch ? ' ok' : ''}`}>
                {count} {count === 1 ? 'titolo' : 'titoli'}
                {tooFew  && ' — aggiungi almeno 5'}
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
                  <span className="btn-dots"><span /><span /><span /></span>
                  cerco su TMDB…
                </span>
              ) : 'cerca i miei film →'}
            </button>

            <p className="form-note">
              il profilo viene salvato nel browser e puoi esportarlo come JSON.
              nessun account richiesto.
            </p>
          </div>
        )}

        {/* ── LETTERBOXD TAB ── */}
        {importMode === 'letterboxd' && (
          <div className="form-block">
            <label className="form-label">
              carica il tuo export da Letterboxd
              <span className="form-hint">
                diary.csv · watched.csv · ratings.csv
              </span>
            </label>

            {!parsedFilms ? (
              <div
                className={`drop-zone${isDragging ? ' drop-zone--active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="drop-icon">↓</span>
                <span className="drop-label">
                  {isDragging ? 'rilascia qui' : 'trascina il file o clicca per sceglierlo'}
                </span>
                <span className="drop-hint">.csv da letterboxd.com → impostazioni → dati → esporta</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </div>
            ) : (
              <div className="import-summary">
                <span className="import-count">{parsedFilms.length.toLocaleString('it')}</span>
                <span className="import-desc">
                  film importati
                  {hasRatings
                    ? ' · analizzerò i 25 con voto più alto'
                    : ' · analizzerò i 25 più recenti'}
                </span>
                <button
                  className="import-reset"
                  onClick={() => { setParsedFilms(null); setParseError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                >
                  cambia file
                </button>
              </div>
            )}

            {parseError && <p className="msg error">{parseError}</p>}
            {error      && <p className="msg error">{error}</p>}

            <button
              className="btn-primary full"
              onClick={handleSearch}
              disabled={!canSearch || loading}
            >
              {loading ? (
                <span className="btn-loading">
                  <span className="btn-dots"><span /><span /><span /></span>
                  cerco su TMDB…
                </span>
              ) : 'cerca i miei film →'}
            </button>

            <p className="form-note">
              tutti i {parsedFilms ? parsedFilms.length.toLocaleString('it') + ' titoli vengono' : 'titoli vengono'} salvati
              localmente per escluderli dai consigli. nessun account richiesto.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
