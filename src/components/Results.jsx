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
          <div>
            <h2 className="results-title">stasera guarda</h2>
            <p className="results-sub">
              <em>{EXP_LABELS[experience] || experience}</em>
              <span className="results-count"> · 3 consigli</span>
            </p>
          </div>
          <button className="btn-text-action" onClick={onAgain}>
            altre idee →
          </button>
        </div>

        <div className="cards-list">
          {recommendations.map((rec, i) => (
            <RecommendationCard key={i} rec={rec} index={i} />
          ))}
        </div>

        <div className="results-footer">
          <button className="btn-secondary" onClick={onBack}>
            cambia esperienza
          </button>
        </div>
      </div>
    </div>
  );
}
