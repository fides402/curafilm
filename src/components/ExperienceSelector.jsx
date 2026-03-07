const EXPERIENCES = [
  {
    id: 'mystery',
    label: 'mistero continuo',
    hint: 'curiosità che non si ferma mai',
    symbol: '◎',
  },
  {
    id: 'tension',
    label: 'tensione narrativa',
    hint: 'ogni scena ti trascina avanti',
    symbol: '↑',
  },
  {
    id: 'contemplative',
    label: 'contemplativo e immersivo',
    hint: 'cinema lento, atmosfera densa',
    symbol: '〜',
  },
  {
    id: 'worldbuilding',
    label: 'scoperta di un mondo',
    hint: 'un universo narrativo da esplorare',
    symbol: '◻',
  },
  {
    id: 'surprise',
    label: 'sorprendimi',
    hint: 'qualcosa di inatteso e distinto',
    symbol: '✦',
  },
];

export default function ExperienceSelector({ onSelect, error }) {
  return (
    <div className="screen experience">
      <div className="experience-inner">
        <h2 className="experience-question">
          cosa vuoi vivere stasera?
        </h2>

        <div className="exp-list">
          {EXPERIENCES.map((exp) => (
            <button
              key={exp.id}
              className="exp-btn"
              onClick={() => onSelect(exp.id)}
            >
              <span className="exp-symbol">{exp.symbol}</span>
              <span className="exp-text">
                <span className="exp-label">{exp.label}</span>
                <span className="exp-hint">{exp.hint}</span>
              </span>
              <span className="exp-arrow">→</span>
            </button>
          ))}
        </div>

        {error && (
          <p className="msg error" style={{ marginTop: '1.5rem' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
