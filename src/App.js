/* global chrome */
import { useState, useEffect } from "react";
import "./App.css";

/* ─── Icons ──────────────────────────────────────────────────────────────── */

const Ico = {
  Network: () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M9 1.5C9 1.5 6 5 6 9s3 7.5 3 7.5M9 1.5C9 1.5 12 5 12 9s-3 7.5-3 7.5M1.5 9h15" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7.5 12L10.5 15L16.5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  XCircle: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  X: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  ),
  AlertTri: () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5L14 13.5H1L7.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M7.5 6V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="7.5" cy="11" r="0.75" fill="currentColor"/>
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
  Server: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1.5" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="7.5" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="3.5" cy="3.5" r="0.75" fill="currentColor"/>
      <circle cx="3.5" cy="9.5" r="0.75" fill="currentColor"/>
    </svg>
  ),
};

/* ─── Scan steps ─────────────────────────────────────────────────────────── */

const SCAN_STEPS = [
  { label: "Fetching application info",  cmd: "aht @{app} application:info" },
  { label: "Resolving balancer EIPs",    cmd: "aht server bal-…"             },
  { label: "Running domain check",       cmd: "aht @{app} domains:check"     },
  { label: "Listing domain aliases",     cmd: "aht @{app} domains:list"      },
];

const ScanCard = ({ step, customer }) => (
  <div className="card">
    <div className="scan-card">
      <div className="scan-header">
        <span className="scan-tag">Scanning</span>
        <span className="scan-customer">{customer}</span>
      </div>
      <div className="scan-divider" />
      <div className="scan-steps">
        {SCAN_STEPS.map((s, i) => {
          const cls = i < step ? "step-done" : i === step ? "step-active" : "step-queue";
          return (
            <div key={i} className={`scan-step ${cls}`}>
              <div className="step-icon">
                {i < step  && <Ico.Check />}
                {i === step && <span className="spin-light" />}
              </div>
              <div>
                <div className="step-label">{s.label}</div>
                <code className="step-cmd">{s.cmd.replace("{app}", customer)}</code>
              </div>
              <div className="step-state">
                {i < step ? "done" : i === step ? "running" : "queued"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

/* ─── Status pill ────────────────────────────────────────────────────────── */

const StatusPill = ({ status }) => {
  const MAP = {
    ok_a:          { label: "OK · A record",       cls: "sp-ok"      },
    ok_cname:      { label: "OK · CNAME",           cls: "sp-ok"      },
    cloudflare:    { label: "Cloudflare CDN",        cls: "sp-warn"    },
    cloudflare_ns: { label: "CF Authoritative",      cls: "sp-warn"    },
    akamai:        { label: "Akamai CDN",            cls: "sp-warn"    },
    not_pointing:  { label: "Not pointing",          cls: "sp-error"   },
    missing_edge:  { label: "Missing edge cluster",  cls: "sp-error"   },
    bypassing:     { label: "Bypassing edge",        cls: "sp-warn"    },
    no_dns:        { label: "No DNS entry",          cls: "sp-neutral" },
  };
  const c = MAP[status] ?? { label: status, cls: "sp-neutral" };
  const dotCls = { "sp-ok": "d-ok", "sp-error": "d-error", "sp-warn": "d-warn", "sp-neutral": "d-neutral" }[c.cls];
  return (
    <span className={`spill ${c.cls}`}>
      <span className={`dot ${dotCls}`} />{c.label}
    </span>
  );
};

/* ─── Env badge ──────────────────────────────────────────────────────────── */

const EnvBadge = ({ env }) => {
  const cls = { prod: "eb-prod", dev: "eb-dev", test: "eb-test", stage: "eb-stage" }[env] ?? "eb-other";
  return <span className={`ebadge ${cls}`}>{env}</span>;
};

/* ─── Domain table ───────────────────────────────────────────────────────── */

const DomainTable = ({ domains }) => (
  <div className="table-wrap">
    <table className="domain-table">
      <thead>
        <tr>
          <th>Domain</th><th>Env</th><th>Status</th>
          <th>Expected IP</th><th>Actual IP</th><th>Match</th>
        </tr>
      </thead>
      <tbody>
        {domains.map((d, i) => (
          <tr key={i}>
            <td className="td-domain">{d.domain}</td>
            <td><EnvBadge env={d.env} /></td>
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

/* ─── Status card ────────────────────────────────────────────────────────── */

const StatusCard = ({ result }) => {
  const { summary, customer } = result;
  const ok = summary.all_repointed;
  const needAction = result.domains.filter(d => !d.matches).length;
  const envRows = [
    { key: "prod",    label: "Production",    ok: summary.prod_repointed,     n: summary.prod_domains_count     },
    { key: "nonprod", label: "Non-production", ok: summary.non_prod_repointed, n: summary.non_prod_domains_count },
  ].filter(e => e.n > 0);

  return (
    <div className="card">
      <div className="status-banner">
        <div className="status-left">
          <div className={`status-glyph ${ok ? "sg-ok" : "sg-error"}`}>
            {ok ? <Ico.CheckCircle /> : <Ico.XCircle />}
          </div>
          <div>
            <div className="status-verdict">
              {ok ? "DNS Repointing Complete" : "DNS Repointing Incomplete"}
            </div>
            <div className="status-meta">
              Customer: <code>{customer}</code>
              &ensp;·&ensp;
              {ok
                ? `All ${summary.total_domains} domain(s) verified`
                : `${needAction} of ${summary.total_domains} domain(s) require action`}
              {summary.cdn_detected && <>&ensp;·&ensp;CDN detected</>}
            </div>
          </div>
        </div>
        <div className="status-chips">
          {envRows.map(e => (
            <div key={e.key} className={`status-chip ${e.ok ? "chip-ok" : "chip-error"}`}>
              <span className={`dot ${e.ok ? "d-ok" : "d-error"}`} />
              {e.label} · <strong>{e.n}</strong>
            </div>
          ))}
        </div>
      </div>

      {(summary.issues.length > 0 || summary.warnings.length > 0) && (
        <div className="issues-list">
          {summary.issues.map((m, i) => (
            <div key={i} className="alert alert-error">
              <Ico.XCircle />{m.replace(/^[❌⚠️]\s*/, "")}
            </div>
          ))}
          {summary.warnings.map((m, i) => (
            <div key={i} className="alert alert-warning">
              <Ico.AlertTri />{m.replace(/^[❌⚠️]\s*/, "")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Env grid ───────────────────────────────────────────────────────────── */

const EnvGrid = ({ environments, summary }) => (
  <div className="card">
    <div className="card-head">
      <span className="card-head-label"><Ico.Server /> Environments</span>
    </div>
    <div className="env-grid">
      {Object.entries(environments).map(([name, data]) => {
        const ok = name === "prod" ? summary.prod_repointed : summary.non_prod_repointed;
        const typeTag = { dedicated: "tag-dedicated", shared: "tag-shared" }[data.type] ?? "tag-unknown";
        return (
          <div key={name} className={`env-card ${ok ? "env-card-ok" : "env-card-error"}`}>
            <div className="env-card-name">{name}</div>
            <div className="env-card-status">
              <span className={`dot ${ok ? "d-ok" : "d-error"}`} />
              {ok ? "Repointed" : "Not repointed"}
            </div>
            <div className="env-card-eip">{data.eip || "—"}</div>
            <div className="env-card-bal">{data.primary_balancer || "—"}</div>
            <span className={`type-tag ${typeTag}`}>{data.type || "unknown"}</span>
          </div>
        );
      })}
    </div>
  </div>
);

/* ─── Slack card ─────────────────────────────────────────────────────────── */

const SlackCard = ({ result }) => {
  const [copied, setCopied] = useState(false);
  const { summary, eips, customer } = result;

  const text = (() => {
    let r = summary.all_repointed
      ? `✅ *DNS Repointing Status: COMPLETE*\n\nCustomer *${customer}* has repointed DNS to the new dedicated balancers.\n\n`
      : `❌ *DNS Repointing Status: INCOMPLETE*\n\nCustomer *${customer}* has NOT repointed DNS yet.\n\n`;
    r += "*EIP Information:*\n";
    const pe = eips.prod, npe = eips.dev || eips.test || eips.stage;
    if (pe)  r += `• Production EIP: \`${pe}\`\n`;
    if (npe && npe !== pe) {
      r += `• Non-Production EIP: \`${npe}\`\n`;
      r += "\n⚠️ *Note:* Different EIPs for prod and non-prod — share both with the customer.\n";
    } else if (npe) {
      r += `• Non-Production EIP: \`${npe}\`\n`;
    }
    r += "\n";
    if (summary.issues.length)   { r += "*Issues:*\n";   summary.issues.forEach(m => { r += `${m}\n`; }); r += "\n"; }
    if (summary.warnings.length) { r += "*Warnings:*\n"; summary.warnings.forEach(m => { r += `${m}\n`; }); r += "\n"; }
    r += "*Domain Summary:*\n";
    r += `• Total: ${summary.total_domains} domain(s)\n`;
    r += `• Production: ${summary.prod_domains_count} — ${summary.prod_repointed ? "✅ OK" : "❌ Needs repointing"}\n`;
    r += `• Non-Production: ${summary.non_prod_domains_count} — ${summary.non_prod_repointed ? "✅ OK" : "❌ Needs repointing"}\n`;
    if (!summary.all_repointed)
      r += "\n*Next Steps:* Customer must update DNS before old shared balancers can be decommissioned.\n";
    if (summary.cdn_detected)
      r += "\n⚠️ *CDN Detected:* Some domains use Cloudflare/Akamai — customer may need to update CDN origin instead.\n";
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

/* ─── Collapsible ────────────────────────────────────────────────────────── */

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

/* ─── App ────────────────────────────────────────────────────────────────── */

export default function App() {
  const [customer, setCustomer]           = useState("");
  const [loading,  setLoading]            = useState(false);
  const [scanStep, setScanStep]           = useState(0);
  const [result,   setResult]             = useState(null);
  const [error,    setError]              = useState(null);
  const [rawDebug, setRawDebug]           = useState(null);
  const [domainListLoading, setDomainListLoading] = useState(false);
  const [domainListResult,  setDomainListResult]  = useState(null);
  const [domainListError,   setDomainListError]   = useState(null);

  useEffect(() => {
    if (!loading) { setScanStep(0); return; }
    const t = [
      setTimeout(() => setScanStep(1), 2000),
      setTimeout(() => setScanStep(2), 4500),
      setTimeout(() => setScanStep(3), 6500),
    ];
    return () => t.forEach(clearTimeout);
  }, [loading]);

  const sendNative = (command, params) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(
        "com.acquia.dns_finder",
        { command, ...params },
        (response) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(response);
        }
      );
    });

  const runFullCheck = async () => {
    const name = customer.trim();
    if (!name) { setError("Enter an application name first."); return; }
    setLoading(true); setError(null); setResult(null); setRawDebug(null);
    try {
      const data = await sendNative("full_check", { username: name });
      if (data.success) { setResult(data); }
      else { setError(data.error || "Check failed."); if (data.raw_outputs) setRawDebug(data.raw_outputs.app_info); }
    } catch (e) {
      setError(`Native host error: ${e.message}. Run install.sh first.`);
    } finally { setLoading(false); }
  };

  const runDomainList = async () => {
    const name = customer.trim();
    if (!name) { setDomainListError("Enter an application name first."); return; }
    setDomainListLoading(true); setDomainListError(null); setDomainListResult(null);
    try {
      const data = await sendNative("domain_list", { username: name });
      if (data.success) setDomainListResult(data);
      else setDomainListError(data.error || "Failed to fetch domain list.");
    } catch (e) {
      setDomainListError(`Native host error: ${e.message}.`);
    } finally { setDomainListLoading(false); }
  };

  const prod    = result?.domains.filter(d => d.env === "prod")  ?? [];
  const nonprod = result?.domains.filter(d => d.env !== "prod")  ?? [];

  return (
    <div className="page">

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-icon"><Ico.Network /></div>
          <span className="topbar-title">Acquia DNS Finder</span>
          <div className="topbar-right">
            <div className="live-badge"><span className="live-dot" />Live</div>
            <span className="topbar-tag">Internal</span>
          </div>
        </div>
      </header>

      <main className="main">

        {/* ── Search card ─────────────────────────────────────────────── */}
        <div className="card">
          <div className="search-section">
            <div className="search-label">Application / Docroot Name</div>
            <div className="search-row">
              <div className="search-input-wrap">
                <span className="search-prefix">&gt;</span>
                <input
                  className="search-input"
                  type="text"
                  value={customer}
                  onChange={e => { setCustomer(e.target.value); setError(null); setResult(null); setRawDebug(null); }}
                  onKeyDown={e => e.key === "Enter" && !loading && runFullCheck()}
                  placeholder="iqstudent"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div className="btn-row">
                <button className="btn-primary" onClick={runFullCheck} disabled={loading}>
                  {loading ? <><span className="spin" />Running…</> : <><Ico.Search />Run Check</>}
                </button>
                <button className="btn-secondary" onClick={runDomainList} disabled={domainListLoading}>
                  {domainListLoading ? <><span className="spin-light" />Loading…</> : <><Ico.List />List Domains</>}
                </button>
              </div>
            </div>
            <p className="search-hint">
              Application name only — no "@" or environment suffix.
              E.g. <code>iqstudent</code> not <code>iqstudent.prod</code>.
            </p>

            {/* Errors */}
            {!loading && error && (
              <div style={{ marginTop: 14 }}>
                <div className="alert alert-error"><Ico.AlertTri />{error}</div>
                {rawDebug && (
                  <details>
                    <summary style={{ cursor:"pointer", fontSize:"0.74rem", color:"var(--t2)", padding:"4px 0" }}>
                      Show raw aht output
                    </summary>
                    <pre className="raw-debug">{rawDebug}</pre>
                  </details>
                )}
              </div>
            )}
            {domainListError && (
              <div className="alert alert-error" style={{ marginTop: 14 }}>
                <Ico.AlertTri />{domainListError}
              </div>
            )}
          </div>
        </div>

        {/* ── Scanning ────────────────────────────────────────────────── */}
        {loading && <ScanCard step={scanStep} customer={customer.trim()} />}

        {/* ── Domain list results ──────────────────────────────────────── */}
        {domainListResult && (
          <div className="card">
            <div className="card-head">
              <span className="card-head-label">
                <Ico.List />Domain Aliases (do:li)
                <span className="count-badge">{domainListResult.total_domains}</span>
              </span>
              <span className="card-head-meta">aht @{domainListResult.customer} domains:list</span>
            </div>
            <div className="card-body">
              <div className="domain-list-grid">
                {domainListResult.domains.map((d, i) => (
                  <div key={i} className="domain-list-item">{d.domain}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────── */}
        {!loading && result && (
          <>
            <StatusCard result={result} />

            <EnvGrid environments={result.environments} summary={result.summary} />

            {/* Domain check */}
            <div className="card">
              <div className="card-head">
                <span className="card-head-label">
                  <Ico.List />Domain Check
                  <span className="count-badge">{result.domains.length}</span>
                </span>
                <span className="card-head-meta">aht @{result.customer} domains:check</span>
              </div>

              {prod.length > 0 && (
                <>
                  <div className="domain-section-label">
                    <span className="dot d-neutral" />Production
                  </div>
                  <DomainTable domains={prod} />
                </>
              )}
              {nonprod.length > 0 && (
                <>
                  <div className="domain-section-label">
                    <span className="dot d-neutral" />Non-production
                  </div>
                  <DomainTable domains={nonprod} />
                </>
              )}
              {result.domains.length === 0 && (
                <div className="card-body" style={{ color:"var(--t2)", fontSize:"0.82rem" }}>
                  No domains found.
                </div>
              )}

              {result.domain_list?.length > 0 && (
                <Coll icon={<Ico.List />} label={`Domain aliases · ${result.domain_list.length} found`}>
                  <div className="domain-list-grid">
                    {result.domain_list.map((d, i) => (
                      <div key={i} className="domain-list-item">{d.domain}</div>
                    ))}
                  </div>
                </Coll>
              )}
            </div>


            {/* Raw output */}
            <div className="card">
              <Coll icon={<Ico.Terminal />} label="Raw Command Output">
                <div className="code-label">Command: <code>aht @{result.customer} application:info</code></div>
                <pre className="code-block">{result.raw_outputs.app_info}</pre>
                <div className="code-label">Command: <code>aht @{result.customer} domains:check</code></div>
                <pre className="code-block">{result.raw_outputs.dc}</pre>
                {result.raw_outputs.domain_list && (
                  <>
                    <div className="code-label">Command: <code>aht @{result.customer} domains:list</code></div>
                    <pre className="code-block">{result.raw_outputs.domain_list}</pre>
                  </>
                )}
              </Coll>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
