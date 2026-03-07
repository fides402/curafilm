const EXPERIENCES = [
  {
    id: 'mystery',
    label: 'mistero continuo',
    hint: 'curiosità che non si ferma mai',
  },
  {
    id: 'tension',
    label: 'tensione narrativa',
    hint: 'ogni scena ti trascina avanti',
  },
  {
    id: 'contemplative',
    label: 'contemplativo e immersivo',
    hint: 'cinema lento, atmosfera densa',
  },
  {
    id: 'worldbuilding',
    label: 'scoperta di un mondo',
    hint: 'un universo narrativo da esplorare',
  },
  {
    id: 'surprise',
    label: 'sorprendimi',
    hint: 'qualcosa di inatteso e distinto',
  },
];

export default function ExperienceSelector({ onSelect, error }) {
  return (
    <div className="screen experience">
      <div className="experience-inner">
        <h2 className="experience-question">cosa vuoi vivere stasera?</h2>

        <div className="exp-list">
          {EXPERIENCES.map((exp) => (
            <button
              key={exp.id}
              className="exp-btn"
              onClick={() => onSelect(exp.id)}
            >
              <span className="exp-label">{exp.label}</span>
              <span className="exp-hint">{exp.hint}</span>
            </button>
          ))}
        </div>

        {error && <p className="msg error" style={{ marginTop: '1.5rem' }}>{error}</p>}
      </div>
    </div>
  );
}
