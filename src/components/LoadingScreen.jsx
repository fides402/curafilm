export default function LoadingScreen() {
  return (
    <div className="screen loading-screen">
      <div className="loading-inner">
        <div className="loading-orbit">
          <span className="orbit-dot" />
        </div>
        <p className="loading-text">sto cercando qualcosa per te…</p>
        <p className="loading-subtext">analisi del profilo narrativo in corso</p>
      </div>
    </div>
  );
}
