import React, { useState } from 'react';
import QueryPanel from './components/QueryPanel';
import ResultsPanel from './components/ResultsPanel';
import { queryAht } from './api/aht';
import './App.css';

function App() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleQuery = async (appName, env, command, serverName, hostname) => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const data = await queryAht(appName, env, command, serverName, hostname);
      if (data.error) {
        setError(data.error);
        setResults(data);
      } else {
        setResults(data);
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setResults(null);
    setError(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">AHT Query Interface</h1>
        <span className="app-subtitle">Acquia Hosting Toolkit — Local CLI Bridge</span>
      </header>
      <main className="app-main">
        <QueryPanel onQuery={handleQuery} onClear={handleClear} loading={loading} />
        <ResultsPanel results={results} loading={loading} error={error} />
      </main>
    </div>
  );
}

export default App;
