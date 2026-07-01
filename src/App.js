import { useState } from "react";
import "./App.css";

/* ─── Icons ──────────────────────────────────────────────── */

const Ico = {
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Check: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2.5 6.5L5.5 9.5L10.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  X: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M3 3L10 10M10 3L3 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  ),
  Terminal: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M3.5 4.5L6 6.5L3.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 8.5H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
};

/* ─── Loading scan steps ─────────────────────────────────── */

const SCAN_STEPS = [
  { label: "Running aht a:i",   cmd: "aht @{app} a:i" },
  { label: "Running aht server",     cmd: "aht server" },
  { label: "Running aht dc",    cmd: "aht @{app} dc" },
  { label: "Running aht do:li", cmd: "aht @{app} do:li" },
];

const ScanCard = ({ step, appName }) => (
  <div className="card scan-outer">
    <div className="scan-card">
      <div className="scan-header">
        <span className="scan-label">Scanning</span>
        <span className="scan-customer">{appName}</span>
      </div>
      <div className="scan-divider" />
      <div className="scan-steps">
        {SCAN_STEPS.map((s, i) => {
          const cls = i < step ? "ss-done" : i === step ? "ss-active" : "ss-pending";
          const cmd = s.cmd.replace("{app}", appName);
          return (
            <div key={i} className={`scan-step ${cls}`}>
              <div className="scan-step-icon">
                {i < step  && <Ico.Check />}
                {i === step && <span className="spin" style={{ width: 10, height: 10, borderTopColor: "#93b4fd", borderColor: "rgba(147,180,253,0.2)" }} />}
              </div>
              <div className="scan-step-text">
                <div className="scan-step-label">{s.label}</div>
                <code className="scan-step-cmd">{cmd}</code>
              </div>
              <div className="scan-step-state">
                {i < step   ? "done"    : ""}
                {i === step ? "running" : ""}
                {i > step   ? "queued"  : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

/* ─── Results display ────────────────────────────────────── */

const ResultCard = ({ cmdName, result }) => {
  const isSuccess = result.success;
  
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-head-label">
          <Ico.Terminal /> {cmdName}
          {isSuccess ? <Ico.Check style={{color: "#22c55e", marginLeft: 8}} /> : <Ico.X style={{color: "#ef4444", marginLeft: 8}} />}
        </span>
      </div>
      <div className="card-body">
        <pre style={{ 
          background: "#0f172a", 
          color: "#e2e8f0", 
          padding: "12px",
          borderRadius: "4px",
          fontSize: "0.85rem",
          overflow: "auto",
          maxHeight: "300px",
          margin: 0,
          fontFamily: "var(--mono)"
        }}>
          {isSuccess 
            ? result.output || "(no output)"
            : `Error: ${result.error}\n${result.stderr}`
          }
        </pre>
      </div>
    </div>
  );
};

/* ─── Main App ───────────────────────────────────────────── */

export default function App() {
  const [appName, setAppName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleRun = async () => {
    if (!appName.trim()) {
      setError("Please enter an app name");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setLoadingStep(0);

    try {
      // Simulate progress through steps
      const stepInterval = setInterval(() => {
        setLoadingStep(prev => {
          const next = prev + 1;
          if (next >= SCAN_STEPS.length) {
            clearInterval(stepInterval);
          }
          return next;
        });
      }, 800);

      // Call backend
      const response = await fetch("http://localhost:3001/run-aht", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: appName.trim() })
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data);
      setLoadingStep(SCAN_STEPS.length);
    } catch (err) {
      setError(`Failed to run AHT commands: ${err.message}. Make sure the backend server is running on port 3001.`);
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <Ico.Terminal />
          <span className="topbar-title">AHT Runner</span>
        </div>
      </div>

      <div className="content">
        <div className="query-section">
          <div className="card">
            <div className="card-head">
              <span className="card-head-label"><Ico.Search /> Run AHT Commands</span>
            </div>
            <div className="card-body" style={{ padding: 16, gap: 12, display: "flex", flexDirection: "column" }}>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleRun()}
                placeholder="Enter app name (e.g., myapp)"
                disabled={loading}
                style={{
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--divider)",
                  fontSize: "1rem",
                  fontFamily: "var(--mono)",
                }}
              />
              <button
                onClick={handleRun}
                disabled={loading || !appName.trim()}
                style={{
                  padding: "10px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: loading || !appName.trim() ? "var(--slate)" : "var(--blue)",
                  color: "white",
                  cursor: loading || !appName.trim() ? "not-allowed" : "pointer",
                  fontSize: "1rem",
                  fontWeight: 600,
                }}
              >
                {loading ? "Running..." : "Run AHT Commands"}
              </button>
            </div>
          </div>

          {error && (
            <div className="card">
              <div className="card-head">
                <span className="card-head-label" style={{ color: "var(--red)" }}>Error</span>
              </div>
              <div className="card-body" style={{ color: "var(--red)" }}>
                {error}
              </div>
            </div>
          )}

          {loading && <ScanCard step={loadingStep} appName={appName} />}

          {results && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: "0.9rem", color: "var(--t2)", marginBottom: 8 }}>
                Results for <code style={{ fontFamily: "var(--mono)" }}>{results.appName}</code> at {new Date(results.timestamp).toLocaleTimeString()}
              </div>
              {Object.entries(results.results).map(([cmdName, result]) => (
                <ResultCard key={cmdName} cmdName={cmdName} result={result} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
