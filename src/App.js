import { useState } from "react";
import "./App.css";
import { runFullCheck, AcquiaApiError } from "./acquiaApi";

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
  Gear: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.4 3.6L11.3 4.7M4.7 11.3L3.6 12.4M12.4 12.4L11.3 11.3M4.7 4.7L3.6 3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
  { label: "Looking up application",      cmd: "GET /applications?filter=…"            },
  { label: "Fetching environments & EIPs", cmd: "GET /applications/{uuid}/environments" },
  { label: "Checking domain DNS status",  cmd: "GET /environments/{id}/domains/{d}/status" },
  { label: "Compiling results",           cmd: "—"                                      },
];

const ScanCard = ({ step, customer }) => (
  <div className="card scan-outer">
    <div className="scan-card">
      <div className="scan-header">
        <span className="scan-label">Scanning</span>
        <span className="scan-customer">{customer}</span>
      </div>
      <div className="scan-divider" />
      <div className="scan-steps">
        {SCAN_STEPS.map((s, i) => {
          const cls = i < step ? "ss-done" : i === step ? "ss-active" : "ss-pending";
          const cmd = s.cmd.replace("{app}", customer);
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

/* ─── Invalid docroot error ──────────────────────────────── */

const DocRootError = ({ customer, message }) => (
  <div className="card">
    <div className="docroot-error">
      <div className="err-icon-ring">
        <Ico.XCircle />
      </div>
      <div className="err-title">Application Not Found</div>
      <div className="err-docroot">"{customer}"</div>
      <div className="err-msg">
        {message || "No Acquia application found for this name."}
      </div>
      <div className="err-hint">
        Verify the docroot name in CCI → Hosted Domains
      </div>
    </div>
  </div>
);

/* ─── Shared credentials revoked/invalid (maintainer-facing) ── */

const CredentialsErrorCard = ({ message }) => (
  <div className="card">
    <div className="docroot-error">
      <div className="err-icon-ring">
        <Ico.AlertTri />
      </div>
      <div className="err-title">Acquia Connection Error</div>
      <div className="err-msg">{message}</div>
    </div>
  </div>
);

/* ─── Status pill ────────────────────────────────────────── */

const StatusPill = ({ status }) => {
  const MAP = {
    ok_a:          { label: "OK · A record",        cls: "sp-ok",      dot: "d-ok"      },
    ok_cname:      { label: "OK · CNAME",            cls: "sp-ok",      dot: "d-ok"      },
    cloudflare:    { label: "Cloudflare CDN",         cls: "sp-warn",    dot: "d-warn"    },
    cloudflare_ns: { label: "CF Authoritative",       cls: "sp-warn",    dot: "d-warn"    },
    akamai:        { label: "Akamai CDN",             cls: "sp-warn",    dot: "d-warn"    },
    not_pointing:  { label: "Not pointing",           cls: "sp-error",   dot: "d-error"   },
    missing_edge:  { label: "Missing edge cluster",   cls: "sp-error",   dot: "d-error"   },
    bypassing:     { label: "Bypassing edge",         cls: "sp-warn",    dot: "d-warn"    },
    no_dns:        { label: "No DNS entry",           cls: "sp-neutral", dot: "d-neutral" },
  };
  const c = MAP[status] ?? { label: status, cls: "sp-neutral", dot: "d-neutral" };
  return (
    <span className={`spill ${c.cls}`}>
      <span className={`dot ${c.dot}`} />
      {c.label}
    </span>
  );
};

/* ─── Env badge ──────────────────────────────────────────── */

const EnvBadge = ({ env }) => {
  const cls = { prod: "eb-prod", dev: "eb-dev", test: "eb-test", stage: "eb-stage" }[env] ?? "eb-other";
  return <span className={`ebadge ${cls}`}>{env}</span>;
};

/* ─── Domain table ───────────────────────────────────────── */

const DomainTable = ({ domains }) => (
  <div className="table-wrap">
    <table className="domain-table">
      <thead>
        <tr>
          <th>Domain</th>
          <th>Env</th>
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

/* ─── Status summary ─────────────────────────────────────── */

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
            <div className="status-glyph-pulse" />
            {ok ? <Ico.CheckCircle /> : <Ico.XCircle />}
          </div>
          <div className="status-info">
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
        <div className="status-env-chips">
          {envRows.map(e => (
            <div key={e.key} className={`env-chip ${e.ok ? "ec-ok" : "ec-error"}`}>
              <span className={`dot ${e.ok ? "d-ok" : "d-error"}`} />
              {e.label} · <strong>{e.n}</strong>
            </div>
          ))}
        </div>
      </div>

      {(summary.issues.length > 0 || summary.warnings.length > 0) && (
        <div className="issues-list">
          {summary.issues.map((m, i) => (
            <div key={i} className="alert-bar alert-bar-error">
              <Ico.XCircle />{m.replace(/^[❌⚠️]\s*/, "")}
            </div>
          ))}
          {summary.warnings.map((m, i) => (
            <div key={i} className="alert-bar alert-bar-warning">
              <Ico.AlertTri />{m.replace(/^[❌⚠️]\s*/, "")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Environment grid ───────────────────────────────────── */

const EnvGrid = ({ environments, summary }) => (
  <div className="card">
    <div className="card-head">
      <span className="card-head-label"><Ico.Dns /> Environments</span>
    </div>
    <div className="env-grid">
      {Object.entries(environments).map(([name, data]) => {
        const ok = name === "prod" ? summary.prod_repointed : summary.non_prod_repointed;
        const typeTag = data.type === "dedicated" ? "tt-dedicated" : data.type === "shared" ? "tt-shared" : "tt-unknown";
        return (
          <div key={name} className={`env-card ${ok ? "ec-left-ok" : "ec-left-error"}`}>
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

/* ─── Slack template ─────────────────────────────────────── */

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
  const [customer, setCustomer] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null); // { type, message }

  const runCheck = async () => {
    const name = customer.trim();
    if (!name) { setError({ type: "validation", message: "Enter an application name first." }); return; }

    setLoading(true); setError(null); setResult(null); setScanStep(0);

    try {
      const data = await runFullCheck(name, setScanStep);

      if (data.success) {
        setResult(data);
      } else if (data.error_type === "invalid_docroot") {
        setError({ type: "invalid_docroot", message: data.error });
      } else {
        setError({ type: "generic", message: data.error || "An unexpected error occurred." });
      }
    } catch (e) {
      if (e instanceof AcquiaApiError && e.status === "BAD_CREDENTIALS") {
        setError({ type: "bad_credentials", message: e.message });
      } else {
        setError({ type: "network", message: e.message || "An unexpected error occurred." });
      }
    } finally {
      setLoading(false);
    }
  };

  const prod    = result?.domains.filter(d => d.env === "prod")  ?? [];
  const nonprod = result?.domains.filter(d => d.env !== "prod")  ?? [];

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
            <div className="query-label">Application / Docroot Name</div>
            <div className="query-row">
              <div className="query-input-wrap">
                <span className="query-prefix">&gt;</span>
                <input
                  className="query-input"
                  type="text"
                  value={customer}
                  onChange={e => { setCustomer(e.target.value); setError(null); setResult(null); }}
                  onKeyDown={e => e.key === "Enter" && !loading && runCheck()}
                  placeholder="iqstudent"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <button className="btn-run" onClick={runCheck} disabled={loading}>
                {loading
                  ? <><span className="spin" /> Running…</>
                  : <><Ico.Search /> Run Check</>}
              </button>
            </div>
            <p className="query-hint">
              Application name only — no "@" or environment suffix.
              E.g. <code>iqstudent</code> not <code>iqstudent.prod</code>.
              Checks all environments in one click.
            </p>

            {!loading && error && !["invalid_docroot", "bad_credentials"].includes(error.type) && (
              <div className="alert-bar alert-bar-error" style={{ marginTop: 12 }}>
                <Ico.AlertTri />{error.message}
              </div>
            )}
          </div>
        </div>

        {/* ── Scanning ───────────────────────────────────────── */}
        {loading && <ScanCard step={scanStep} customer={customer.trim()} />}

        {/* ── Invalid docroot ─────────────────────────────────── */}
        {!loading && error?.type === "invalid_docroot" && (
          <DocRootError customer={customer.trim()} message={error.message} />
        )}

        {/* ── Shared credentials revoked/invalid ──────────────── */}
        {!loading && error?.type === "bad_credentials" && <CredentialsErrorCard message={error.message} />}

        {/* ── Results ────────────────────────────────────────── */}
        {!loading && result && (
          <>
            <StatusCard result={result} />

            <EnvGrid environments={result.environments} summary={result.summary} />

            {/* Domain check */}
            <div className="card">
              <div className="card-head">
                <span className="card-head-label">
                  <Ico.List /> Domain Check
                  <span className="count-pill">{result.domains.length}</span>
                </span>
                <span className="card-head-meta">{result.application?.hosting_id || result.customer}</span>
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
                <div className="card-body" style={{ color: "var(--t2)", fontSize: "0.82rem" }}>
                  No domains found — the application has no configured hosted domains.
                </div>
              )}

              {result.domain_list?.length > 0 && (
                <Coll icon={<Ico.List />} label={`All domain aliases · ${result.domain_list.length} found`}>
                  <div className="domain-list-grid">
                    {result.domain_list.map((d, i) => (
                      <div key={i} className="domain-list-item">{d.domain}</div>
                    ))}
                  </div>
                </Coll>
              )}
            </div>

            <SlackCard result={result} />

            {/* Raw output */}
            <div className="card">
              <Coll icon={<Ico.Terminal />} label="Raw Acquia API Data">
                <div className="code-label">
                  Application: <code>{result.application?.name}</code> ({result.application?.hosting_id})
                </div>
                <pre className="code-block">{JSON.stringify(result, null, 2)}</pre>
              </Coll>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
