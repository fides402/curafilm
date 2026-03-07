import { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import ExperienceSelector from './components/ExperienceSelector';
import LoadingScreen from './components/LoadingScreen';
import Results from './components/Results';
import ProfilePage from './components/ProfilePage';

const PROFILE_KEY     = 'curafilm_profile';
const TASTE_VEC_KEY   = 'curafilm_taste_vector';

export default function App() {
  const [screen, setScreen]               = useState('init');
  const [profile, setProfile]             = useState(null);
  const [tasteVector, setTasteVector]     = useState(null);
  const [recommendations, setRecommendations] = useState({ classics: [], recent: [] });
  const [currentMood, setCurrentMood]     = useState(null);   // { key, label, desc, vector }
  const [error, setError]                 = useState('');
  const [showProfile, setShowProfile]     = useState(false);

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(PROFILE_KEY);
      if (savedProfile) {
        setProfile(JSON.parse(savedProfile));
        const savedTV = localStorage.getItem(TASTE_VEC_KEY);
        if (savedTV) setTasteVector(JSON.parse(savedTV));
        setScreen('experience');
      } else {
        setScreen('onboarding');
      }
    } catch {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(TASTE_VEC_KEY);
      setScreen('onboarding');
    }
  }, []);

  // Analyze taste profile in background after onboarding
  const analyzeTasteVector = async (newProfile) => {
    try {
      const res = await fetch('/api/profile-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: newProfile }),
      });
      const data = await res.json();
      if (data.tasteVector) {
        localStorage.setItem(TASTE_VEC_KEY, JSON.stringify(data.tasteVector));
        setTasteVector(data.tasteVector);
      }
    } catch {
      // non-blocking — recommendations fall back to neutral weights
    }
  };

  const handleProfileBuilt = (newProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(newProfile));
    setProfile(newProfile);
    setScreen('experience');
    analyzeTasteVector(newProfile); // fire-and-forget
  };

  const handleMoodSelected = async (mood) => {
    setCurrentMood(mood);
    setScreen('loading');
    setError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 24000);
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          tasteVector,
          mood: mood.label,
          moodVector: mood.vector,
        }),
        signal: controller.signal,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error('risposta non valida dal server. riprova.'); }
      if (data.error) throw new Error(data.error);
      setRecommendations(data);
      setScreen('results');
    } catch (err) {
      const msg = err.name === 'AbortError'
        ? 'la ricerca ha impiegato troppo. riprova tra un momento.'
        : (err.message || 'qualcosa è andato storto. riprova.');
      setError(msg);
      setScreen('experience');
    } finally {
      clearTimeout(timeout);
    }
  };

  const handleTryAgain = () => {
    if (currentMood) handleMoodSelected(currentMood);
  };

  const handleBackToExperience = () => {
    setScreen('experience');
    setRecommendations({ classics: [], recent: [] });
  };

  const handleResetProfile = () => {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(TASTE_VEC_KEY);
    setProfile(null);
    setTasteVector(null);
    setRecommendations({ classics: [], recent: [] });
    setCurrentMood(null);
    setShowProfile(false);
    setScreen('onboarding');
  };

  const handleExportProfile = () => {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
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
                onSelect={handleMoodSelected}
                error={error}
              />
            )}
            {screen === 'loading' && <LoadingScreen />}
            {screen === 'results' && (
              <Results
                recommendations={recommendations}
                experience={currentMood?.label}
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
