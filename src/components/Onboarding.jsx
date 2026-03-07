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

export default function Onboarding({ onProfileBuilt }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const titles = input
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  const count = titles.length;
  const tooFew = count > 0 && count < 5;
  const tooMany = count > 25;
  const valid = count >= 5 && count <= 25;

  const handleSubmit = async () => {
    if (!valid) return;
    setLoading(true);
    setError('');
    setProgress('cerco i film su TMDB…');

    try {
      const res = await fetch('/api/search-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles }),
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const found = data.filter(Boolean);
      if (found.length < 3) {
        throw new Error(
          'ho trovato pochi film. controlla i titoli e riprova.'
        );
      }

      setProgress('profilo pronto!');
      setTimeout(() => onProfileBuilt(found), 400);
    } catch (err) {
      setError(err.message || 'errore di connessione. riprova.');
      setLoading(false);
      setProgress('');
    }
  };

  return (
    <div className="screen onboarding">
      <div className="onboarding-inner">
        <div className="onboarding-hero">
          <h1 className="brand-title">curafilm</h1>
          <p className="brand-sub">il tuo sistema curatoriale personale</p>
        </div>

        <div className="form-block">
          <label className="form-label">
            inserisci i film e serie che ami
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
              className={`count-badge${tooFew ? ' warn' : tooMany ? ' bad' : valid ? ' ok' : ''}`}
            >
              {count} {count === 1 ? 'titolo' : 'titoli'}
              {tooFew && ' (min 5)'}
              {tooMany && ' (max 25)'}
            </span>
          </div>

          {error && <p className="msg error">{error}</p>}
          {loading && progress && <p className="msg progress">{progress}</p>}

          <button
            className="btn-primary full"
            onClick={handleSubmit}
            disabled={!valid || loading}
          >
            {loading ? 'costruisco il profilo…' : 'costruisci il mio profilo'}
          </button>

          <p className="form-note">
            il profilo viene salvato nel browser e puoi esportarlo in JSON in
            qualsiasi momento.
          </p>
        </div>
      </div>
    </div>
  );
}
