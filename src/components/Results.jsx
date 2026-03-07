import RecommendationCard from './RecommendationCard';

export default function Results({ recommendations, experience, onBack, onAgain }) {
  const { classics = [], recent = [] } = recommendations;

  return (
    <div className="screen results">
      <div className="results-inner">

        <div className="results-head">
          <div>
            <h2 className="results-title">stasera guarda</h2>
            {experience && (
              <p className="results-experience">"{experience}"</p>
            )}
          </div>
          <button className="btn-text-action" onClick={onAgain}>
            altre idee →
          </button>
        </div>

        {classics.length > 0 && (
          <section className="results-section">
            <div className="section-label">
              <span className="section-tag">di tutti i tempi</span>
            </div>
            <div className="cards-list">
              {classics.map((rec, i) => (
                <RecommendationCard key={`c-${i}`} rec={rec} index={i} />
              ))}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="results-section">
            <div className="section-label">
              <span className="section-tag">recenti e recentissime</span>
              <span className="section-since">dal 2019</span>
            </div>
            <div className="cards-list">
              {recent.map((rec, i) => (
                <RecommendationCard key={`r-${i}`} rec={rec} index={i} />
              ))}
            </div>
          </section>
        )}

        <div className="results-footer">
          <button className="btn-secondary" onClick={onBack}>
            cambia esperienza
          </button>
        </div>

      </div>
    </div>
  );
}
