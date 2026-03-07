import { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import ExperienceSelector from './components/ExperienceSelector';
import LoadingScreen from './components/LoadingScreen';
import Results from './components/Results';
import ProfilePage from './components/ProfilePage';

const PROFILE_KEY = 'curafilm_profile';

export default function App() {
  const [screen, setScreen] = useState('init');
  const [profile, setProfile] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [experience, setExperience] = useState(null);
  const [error, setError] = useState('');
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) {
        setProfile(JSON.parse(saved));
        setScreen('experience');
      } else {
        setScreen('onboarding');
      }
    } catch {
      localStorage.removeItem(PROFILE_KEY);
      setScreen('onboarding');
    }
  }, []);

  const handleProfileBuilt = (newProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(newProfile));
    setProfile(newProfile);
    setScreen('experience');
  };

  const handleExperienceSelected = async (exp) => {
    setExperience(exp);
    setScreen('loading');
    setError('');
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, experience: exp }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRecommendations(data);
      setScreen('results');
    } catch (err) {
      setError(err.message || 'qualcosa è andato storto. riprova.');
      setScreen('experience');
    }
  };

  const handleTryAgain = () => {
    if (experience) handleExperienceSelected(experience);
  };

  const handleBackToExperience = () => {
    setScreen('experience');
    setRecommendations([]);
  };

  const handleResetProfile = () => {
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setRecommendations([]);
    setExperience(null);
    setShowProfile(false);
    setScreen('onboarding');
  };

  const handleExportProfile = () => {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'curafilm-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (screen === 'init') return null;

  return (
    <div className="app">
      <header className="header">
        <button
          className="wordmark-btn"
          onClick={() => screen !== 'onboarding' && setScreen('experience')}
          style={{ cursor: screen === 'onboarding' ? 'default' : 'pointer' }}
        >
          curafilm
        </button>

        {profile && screen !== 'onboarding' && (
          <button
            className="btn-profile-toggle"
            onClick={() => setShowProfile((v) => !v)}
            aria-label="profilo"
          >
            <span className="profile-icon">◉</span>
            <span className="profile-count">{profile.length}</span>
          </button>
        )}
      </header>

      <main className="main">
        {showProfile && profile ? (
          <ProfilePage
            profile={profile}
            onClose={() => setShowProfile(false)}
            onReset={handleResetProfile}
            onExport={handleExportProfile}
          />
        ) : (
          <>
            {screen === 'onboarding' && (
              <Onboarding onProfileBuilt={handleProfileBuilt} />
            )}
            {screen === 'experience' && (
              <ExperienceSelector
                onSelect={handleExperienceSelected}
                error={error}
              />
            )}
            {screen === 'loading' && <LoadingScreen />}
            {screen === 'results' && (
              <Results
                recommendations={recommendations}
                experience={experience}
                onBack={handleBackToExperience}
                onAgain={handleTryAgain}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
