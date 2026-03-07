import { useState } from 'react';

export const MOODS = [
  {
    key: 'mistero_continuo',
    label: 'mistero continuo',
    desc: 'qualcosa che si apre piano — non voglio sapere tutto subito',
    vector: { desired_mystery: 0.95, desired_tension: 0.60, desired_contemplation: 0.48, desired_world_exploration: 0.55, desired_hook_speed: 0.72 },
  },
  {
    key: 'tensione_narrativa',
    label: 'tensione narrativa',
    desc: 'ogni scena mi trascina avanti, non riesco a smettere',
    vector: { desired_mystery: 0.62, desired_tension: 0.95, desired_contemplation: 0.16, desired_world_exploration: 0.28, desired_hook_speed: 0.94 },
  },
  {
    key: 'immersione_contemplativa',
    label: 'immersione contemplativa',
    desc: 'qualcosa di lento e visivo — atmosfera in cui perdermi',
    vector: { desired_mystery: 0.40, desired_tension: 0.25, desired_contemplation: 0.96, desired_world_exploration: 0.62, desired_hook_speed: 0.32 },
  },
  {
    key: 'world_building',
    label: 'world building',
    desc: 'un mondo denso da scoprire — voglio sentirmi dentro qualcosa',
    vector: { desired_mystery: 0.60, desired_tension: 0.46, desired_contemplation: 0.58, desired_world_exploration: 0.96, desired_hook_speed: 0.50 },
  },
  {
    key: 'hook_immediato',
    label: 'hook immediato',
    desc: 'prendimi dai primi 10 minuti — non voglio aspettare',
    vector: { desired_mystery: 0.50, desired_tension: 0.82, desired_contemplation: 0.10, desired_world_exploration: 0.30, desired_hook_speed: 0.98 },
  },
  {
    key: 'sorpresa_autoriale',
    label: 'sorpresa autoriale',
    desc: 'sorprendimi con qualcosa che non avrei scelto da solo',
    vector: { desired_mystery: 0.72, desired_tension: 0.52, desired_contemplation: 0.68, desired_world_exploration: 0.72, desired_hook_speed: 0.56 },
  },
];

export default function ExperienceSelector({ onSelect, error }) {
  const [selected, setSelected] = useState(null);

  const handleMoodClick = (mood) => {
    setSelected(mood.key);
    onSelect(mood);
  };

  return (
    <div className="screen experience">
      <div className="experience-inner">
        <div>
          <h2 className="experience-question">cosa vuoi vivere stasera?</h2>
          <p className="experience-sub">scegli lo stato che senti più vicino — il resto lo faccio io</p>
        </div>

        <div className="mood-grid">
          {MOODS.map((mood) => (
            <button
              key={mood.key}
              className={`mood-card${selected === mood.key ? ' mood-card--selected' : ''}`}
              onClick={() => handleMoodClick(mood)}
            >
              <span className="mood-card-label">{mood.label}</span>
              <span className="mood-card-desc">{mood.desc}</span>
            </button>
          ))}
        </div>

        {error && <p className="msg error">{error}</p>}
      </div>
    </div>
  );
}
