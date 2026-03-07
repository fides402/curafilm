import { useState } from 'react';

const SUGGESTIONS = [
  "tensione che non molla, ogni scena mi trascina avanti",
  "qualcosa di lento e visivo, atmosfera in cui perdermi",
  "un mistero che si apre piano, non voglio sapere tutto subito",
  "un mondo da scoprire, qualcosa di denso e costruito",
  "sorprendimi con qualcosa che non avrei scelto da solo",
];

export default function ExperienceSelector({ onSelect, error }) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    onSelect(trimmed);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = text.trim().length >= 3;

  return (
    <div className="screen experience">
      <div className="experience-inner">
        <div>
          <h2 className="experience-question">cosa vuoi vivere stasera?</h2>
          <p className="experience-sub">
            descrivi liberamente &mdash; una sensazione, atmosfera, desiderio narrativo
          </p>
        </div>

        <div className="exp-input-block">
          <textarea
            className="exp-textarea"
            placeholder="es. tensione che non molla, voglio essere trascinato avanti scena dopo scena..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            rows={4}
            autoFocus
          />
          <div className="exp-input-footer">
            <span className="exp-hint-key">invio per cercare</span>
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              trova
            </button>
          </div>
        </div>

        <div className="suggestions-block">
          <p className="suggestions-label">oppure scegli un idea</p>
          <div className="suggestions-list">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="suggestion-pill"
                onClick={() => setText(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="msg error">{error}</p>}
      </div>
    </div>
  );
}
