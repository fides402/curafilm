import RecommendationCard from './RecommendationCard';

const EXP_LABELS = {
  mystery: 'mistero continuo',
  tension: 'tensione narrativa',
  contemplative: 'contemplativo e immersivo',
  worldbuilding: 'scoperta di un mondo',
  surprise: 'sorprendimi',
};

export default function Results({ recommendations, experience, onBack, onAgain }) {
  return (
    <div className="screen results">
      <div className="results-inner">
        <div className="results-head">
          <h2 className="results-title">stasera guarda</h2>
          <p className="results-sub">
            selezionato per:{' '}
            <em>{EXP_LABELS[experience] || experience}</em>
          </p>
        </div>

        <div className="cards-list">
          {recommendations.map((rec, i) => (
            <RecommendationCard key={i} rec={rec} index={i} />
          ))}
        </div>

        <div className="results-actions">
          <button className="btn-secondary" onClick={onBack}>
            cambia esperienza
          </button>
          <button className="btn-ghost" onClick={onAgain}>
            altre idee →
          </button>
        </div>
      </div>
    </div>
  );
}
