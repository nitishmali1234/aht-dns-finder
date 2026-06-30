import { useState } from "react";
import "./App.css";
import { runDomainCheck } from "./dnsCheck";

/* ─── Icons ──────────────────────────────────────────────── */

const Ico = {
  Dns: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="9.5" width="14" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="4" cy="4.25" r="0.9" fill="currentColor"/>
      <circle cx="4" cy="11.75" r="0.9" fill="currentColor"/>
      <path d="M7 4.25H12M7 11.75H12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="9.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 11L9.5 13.5L15 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  XCircle: () => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="9.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7.5 7.5L14.5 14.5M14.5 7.5L7.5 14.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
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
  AlertTri: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5L13 12.5H1L7 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7 5.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="7" cy="10.5" r="0.75" fill="currentColor"/>
    </svg>
  ),
  Copy: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2 9.5V2.5C2 2.22 2.22 2 2.5 2H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Chevron: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  List: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M4.5 3.5H11.5M4.5 6.5H11.5M4.5 9.5H11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="2" cy="3.5" r="0.8" fill="currentColor"/>
      <circle cx="2" cy="6.5" r="0.8" fill="currentColor"/>
      <circle cx="2" cy="9.5" r="0.8" fill="currentColor"/>
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
  { label: "Resolving DNS records", cmd: "GET dns.google/resolve?name=…&type=A" },
  { label: "Compiling results",     cmd: "—" },
];

const ScanCard = ({ step }) => (
  <div className="card scan-outer">
    <div className="scan-card">
      <div className="scan-header">
        <span className="scan-label">Checking DNS</span>
      </div>
      <div className="scan-divider" />
      <div className="scan-steps">
        {SCAN_STEPS.map((s, i) => {
          const cls = i < step ? "ss-done" : i === step ? "ss-active" : "ss-pending";
          return (
            <div key={i} className={`scan-step ${cls}`}>
              <div className="scan-step-icon">
                {i < step  && <Ico.Check />}
                {i === step && <span className="spin" style={{ width: 10, height: 10, borderTopColor: "#93b4fd", borderColor: "rgba(147,180,253,0.2)" }} />}
              </div>
              <div className="scan-step-text">
                <div className="scan-step-label">{s.label}</div>
                <code className="scan-step-cmd">{s.cmd}</code>
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

/* ─── Status pill ────────────────────────────────────────── */

const StatusPill = ({ status }) => {
  const MAP = {
    ok_a:         { label: "OK · resolving correctly", cls: "sp-ok",      dot: "d-ok"      },
    not_pointing: { label: "Not pointing",              cls: "sp-error",   dot: "d-error"   },
    no_dns:       { label: "No DNS entry",              cls: "sp-neutral", dot: "d-neutral" },
    unknown:      { label: "Lookup failed",             cls: "sp-warn",    dot: "d-warn"    },
  };
  const c = MAP[status] ?? { label: status, cls: "sp-neutral", dot: "d-neutral" };
  return (
    <span className={`spill ${c.cls}`}>
      <span className={`dot ${c.dot}`} />
      {c.label}
    </span>
  );
};

/* ─── Domain table ───────────────────────────────────────── */

const DomainTable = ({ domains }) => (
  <div className="table-wrap">
    <table className="domain-table">
      <thead>
        <tr>
          <th>Domain</th>
          <th>Status</th>
          <th>Expected IP</th>
          <th>Actual IP</th>
          <th>Match</th>
        </tr>
      </thead>
      <tbody>
        {domains.map((d, i) => (
          <tr key={i}>
            <td className="td-domain">{d.domain}</td>
            <td><StatusPill status={d.status} /></td>
            <td className="td-ip">{d.expected_ip || "—"}</td>
            <td className={`td-ip ${d.matches ? "td-ip-ok" : "td-ip-fail"}`}>
              {d.actual_ip || "—"}
            </td>
            <td>
              {d.matches
                ? <span className="td-match-ok"><Ico.Check /></span>
                : <span className="td-match-fail"><Ico.X /></span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ─── Status summary ─────────────────────────────────────── */

const StatusCard = ({ result }) => {
  const { summary, expected_ip } = result;
  const ok = summary.all_repointed;

  return (
    <div className="card">
      <div className="status-banner">
        <div className="status-left">
          <div className={`status-glyph ${ok ? "sg-ok" : "sg-error"}`}>
            <div className="status-glyph-pulse" />
            {ok ? <Ico.CheckCircle /> : <Ico.XCircle />}
          </div>
          <div className="status-info">
            <div className="status-verdict">
              {ok ? "DNS Repointing Complete" : "DNS Repointing Incomplete"}
            </div>
            <div className="status-meta">
              Expected IP: <code>{expected_ip}</code>
              &ensp;·&ensp;
              {ok
                ? `All ${summary.total_domains} domain(s) verified`
                : `${summary.need_action} of ${summary.total_domains} domain(s) require action`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Slack template ─────────────────────────────────────── */

const SlackCard = ({ result }) => {
  const [copied, setCopied] = useState(false);
  const { summary, expected_ip, domains } = result;

  const text = (() => {
    let r = summary.all_repointed
      ? `✅ *DNS Repointing Status: COMPLETE*\n\nAll domains have repointed to \`${expected_ip}\`.\n\n`
      : `❌ *DNS Repointing Status: INCOMPLETE*\n\nNot all domains are pointing to \`${expected_ip}\` yet.\n\n`;

    r += "*Domain Summary:*\n";
    domains.forEach((d) => {
      r += `• \`${d.domain}\` — ${d.matches ? "✅ OK" : `❌ ${d.status_detail}`}\n`;
    });
    r += `\n• Total: ${summary.total_domains} domain(s)\n`;
    if (!summary.all_repointed)
      r += "\n*Next Steps:* Customer must update DNS to the expected IP above.\n";
    return r;
  })();

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-head-label">Slack Response Template</span>
        <button className="btn-ghost" onClick={copy}>
          {copied ? <><Ico.Check /> Copied</> : <><Ico.Copy /> Copy</>}
        </button>
      </div>
      <div className="card-body">
        <pre className="slack-pre">{text}</pre>
      </div>
    </div>
  );
};

/* ─── Collapsible ────────────────────────────────────────── */

const Coll = ({ icon, label, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="coll-trigger" onClick={() => setOpen(o => !o)}>
        {icon}{label}
        <span className={`coll-chevron ${open ? "open" : ""}`}><Ico.Chevron /></span>
      </button>
      {open && <div className="coll-body">{children}</div>}
    </>
  );
};

/* ─── App ────────────────────────────────────────────────── */

export default function App() {
  const [expectedIp, setExpectedIp] = useState("");
  const [domainsRaw, setDomainsRaw] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [scanStep,   setScanStep]   = useState(0);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null); // { message }

  const runCheck = async () => {
    setLoading(true); setError(null); setResult(null); setScanStep(0);

    try {
      const data = await runDomainCheck(expectedIp, domainsRaw, setScanStep);
      if (data.success) {
        setResult(data);
      } else {
        setError({ message: data.error });
      }
    } catch (e) {
      setError({ message: e.message || "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">

      {/* ── Topbar ─────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-logo"><Ico.Dns /></div>
          <span className="topbar-title">Acquia DNS Finder</span>
          <div className="topbar-sep" />
          <span className="topbar-sub">T1 Repointing Checker</span>
          <div className="topbar-right">
            <div className="topbar-live"><span className="live-dot" />Live</div>
            <span className="topbar-tag">Internal</span>
          </div>
        </div>
      </header>

      <main className="main">

        {/* ── Query ──────────────────────────────────────────── */}
        <div className="card">
          <div className="query-section">
            <div className="query-label">Expected IP Address</div>
            <div className="query-row">
              <div className="query-input-wrap">
                <span className="query-prefix">&gt;</span>
                <input
                  className="query-input"
                  type="text"
                  value={expectedIp}
                  onChange={e => { setExpectedIp(e.target.value); setError(null); setResult(null); }}
                  placeholder="192.0.2.10"
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>
            <p className="query-hint">
              The correct/expected IP for this environment — e.g. the EIP shown in CCI.
            </p>

            <div className="query-label" style={{ marginTop: 16 }}>Domain(s) to Check</div>
            <div className="query-row">
              <div className="query-input-wrap">
                <span className="query-prefix">&gt;</span>
                <textarea
                  className="query-input"
                  style={{ minHeight: 64, resize: "vertical", paddingTop: 8 }}
                  value={domainsRaw}
                  onChange={e => { setDomainsRaw(e.target.value); setError(null); setResult(null); }}
                  placeholder={"www.example.com\nexample.com"}
                  disabled={loading}
                />
              </div>
            </div>
            <p className="query-hint">
              One domain per line (or comma-separated). Checked with a free, anonymous public DNS lookup — no Acquia API, no login.
            </p>

            <button className="btn-run" onClick={runCheck} disabled={loading} style={{ marginTop: 12 }}>
              {loading
                ? <><span className="spin" /> Running…</>
                : <><Ico.Search /> Run Check</>}
            </button>

            {!loading && error && (
              <div className="alert-bar alert-bar-error" style={{ marginTop: 12 }}>
                <Ico.AlertTri />{error.message}
              </div>
            )}
          </div>
        </div>

        {/* ── Scanning ───────────────────────────────────────── */}
        {loading && <ScanCard step={scanStep} />}

        {/* ── Results ────────────────────────────────────────── */}
        {!loading && result && (
          <>
            <StatusCard result={result} />

            <div className="card">
              <div className="card-head">
                <span className="card-head-label">
                  <Ico.List /> Domain Check
                  <span className="count-pill">{result.domains.length}</span>
                </span>
              </div>
              <DomainTable domains={result.domains} />
            </div>

            <SlackCard result={result} />

            <div className="card">
              <Coll icon={<Ico.Terminal />} label="Raw DNS Lookup Data">
                <pre className="code-block">{JSON.stringify(result, null, 2)}</pre>
              </Coll>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
