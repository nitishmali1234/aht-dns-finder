/* global chrome */
import { useState, useEffect, useRef } from "react";
import "./App.css";

/* ─── Constants ──────────────────────────────────────────────────────────── */
const CF_DNS = "https://cloudflare-dns.com/dns-query";

/* ─── Background bridge ──────────────────────────────────────────────────── */
function bgMsg(payload) {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(payload, r => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(r);
    })
  );
}

/* ─── Acquia Cloud API (uses cloud.acquia.com session via tab injection) ─── */
async function acqGet(path) {
  const resp = await bgMsg({ type: 'ACQUIA_API_CALL', endpoint: path });
  if (!resp) throw new Error('No response from background worker.');
  if (resp.error === 'NOT_LOGGED_IN' || resp.error === 'NO_TOKEN') throw new Error('NOT_LOGGED_IN');
  if (resp.error) throw new Error(resp.error);
  if (!resp.ok) {
    let body = resp.body || '';
    try { const j = JSON.parse(body); body = j.message || j.detail || j.error || body; } catch {}
    throw new Error(`Acquia API (${resp.status}): ${body || 'Unknown error'}`);
  }
  return JSON.parse(resp.body);
}

async function findApp(name) {
  try {
    const d = await acqGet(`/applications?filter=hosting_id%3D${encodeURIComponent(name)}&sort=name`);
    const items = d._embedded?.items || [];
    if (items.length) return items[0];
  } catch (e) {
    if (e.message === 'NOT_LOGGED_IN') throw e;
  }
  const d = await acqGet('/applications?sort=name&limit=100');
  const all = d._embedded?.items || [];
  const match = all.find(a => {
    const docroot = (a.hosting?.id || '').split(':').pop();
    return docroot === name || (a.name || '').toLowerCase() === name.toLowerCase();
  });
  if (match) return match;
  throw new Error(`Application "${name}" not found. Verify the docroot name.`);
}

async function getEnvs(appUuid) {
  const d = await acqGet(`/applications/${appUuid}/environments`);
  return d._embedded?.items || [];
}

async function getEnvDomains(envUuid) {
  try {
    const d = await acqGet(`/environments/${envUuid}/domains`);
    return (d._embedded?.items || []).map(i => i.hostname || i.name || i.domain).filter(Boolean);
  } catch { return []; }
}

/* ─── DNS-over-HTTPS (Cloudflare 1.1.1.1) ───────────────────────────────── */
async function resolveDomain(domain) {
  const [aData, cData] = await Promise.all([
    fetch(`${CF_DNS}?name=${encodeURIComponent(domain)}&type=A`,     { headers: { Accept: 'application/dns-json' } }).then(r => r.json()).catch(() => null),
    fetch(`${CF_DNS}?name=${encodeURIComponent(domain)}&type=CNAME`, { headers: { Accept: 'application/dns-json' } }).then(r => r.json()).catch(() => null),
  ]);
  const ips    = (aData?.Answer || []).filter(a => a.type === 1).map(a => a.data);
  const cnames = [
    ...(aData?.Answer || []).filter(a => a.type === 5),
    ...(cData?.Answer || []).filter(a => a.type === 5),
  ].map(a => a.data.replace(/\.$/, '')).filter((v, i, arr) => arr.indexOf(v) === i);
  return { ips, cnames };
}

function dnsStatus(ips, cnames, expectedIPs) {
  if (!ips.length && !cnames.length) return 'no_dns';
  if (expectedIPs.length && ips.some(ip => expectedIPs.includes(ip))) return 'ok_a';
  const all = [...ips, ...cnames].join(' ').toLowerCase();
  if (all.includes('cloudflare') || cnames.some(c => /\.cloudflare\.net$/.test(c))) return 'cloudflare';
  if (all.includes('akamai') || all.includes('edgekey') || all.includes('akamaiedge'))  return 'akamai';
  if (all.includes('fastly')) return 'fastly';
  if (cnames.some(c => c.includes('acquia-sites') || c.includes('acquia.com'))) return 'ok_cname';
  if (cnames.length) return 'cname_other';
  if (ips.length)    return 'not_pointing';
  return 'no_dns';
}

/* ─── Main check ─────────────────────────────────────────────────────────── */
const OK_STATUSES = new Set(['ok_a', 'ok_cname', 'cloudflare', 'akamai', 'fastly']);

async function performCheck(appName, onStep) {
  onStep(0);
  const app     = await findApp(appName);
  const envList = await getEnvs(app.uuid);

  onStep(1);
  const envDomainsList = await Promise.all(
    envList.map(env => getEnvDomains(env.uuid || env.id))
  );

  onStep(2);
  const tasks = [];
  envList.forEach((env, i) => {
    const expectedIPs = env.ips || [];
    envDomainsList[i].forEach(domain => {
      if (domain.endsWith('.acquia-sites.com') || domain.endsWith('.acquia.com')) return;
      tasks.push({ env, domain, expectedIPs });
    });
  });

  onStep(3);
  const dnsResults = await Promise.all(
    tasks.map(async ({ env, domain, expectedIPs }) => {
      const { ips, cnames } = await resolveDomain(domain);
      const status = dnsStatus(ips, cnames, expectedIPs);
      return {
        env:         env.name,
        domain,
        expected_ip: expectedIPs[0] || null,
        actual_ip:   ips[0] || null,
        cname:       cnames[0] || null,
        status,
        matches:     OK_STATUSES.has(status),
      };
    })
  );

  const environments = envList.map(env => {
    const domains   = dnsResults.filter(d => d.env === env.name);
    const repointed = domains.length === 0 || domains.every(d => OK_STATUSES.has(d.status));
    return {
      name:       env.name,
      label:      env.label || env.name,
      ips:        env.ips || [],
      primary_ip: (env.ips || [])[0] || null,
      type:       env.type || (env.name === 'prod' ? 'production' : 'non-production'),
      repointed,
      domains,
    };
  });

  const allRepointed = environments.every(e => e.repointed);
  const cdnDomains   = dnsResults.filter(d => ['cloudflare', 'akamai', 'fastly'].includes(d.status));

  const issues   = environments.filter(e => !e.repointed && e.domains.length > 0)
                               .map(e => `${e.label} domains have NOT been repointed`);
  const warnings = [];
  if (cdnDomains.length)
    warnings.push(`${cdnDomains.length} domain(s) use a CDN — verify origin points to the correct Acquia IP`);
  const uniqueIPs = new Set(environments.map(e => e.primary_ip).filter(Boolean));
  if (uniqueIPs.size > 1)
    warnings.push('Different IPs across environments — share the correct IP per environment with the customer');

  return {
    customer:     appName,
    app_name:     app.name,
    environments,
    all_repointed: allRepointed,
    total_domains: dnsResults.length,
    issues,
    warnings,
    cdn_detected:  cdnDomains.length > 0,
  };
}

/* ─── Scan steps ─────────────────────────────────────────────────────────── */
const SCAN_STEPS = [
  { label: 'Reading Acquia session',    cmd: 'cloud.acquia.com — Okta session token'           },
  { label: 'Fetching application info', cmd: 'GET cloud.acquia.com/api/applications/…/environments' },
  { label: 'Loading domain lists',      cmd: 'GET cloud.acquia.com/api/environments/…/domains' },
  { label: 'Resolving DNS records',     cmd: 'Cloudflare DNS-over-HTTPS (1.1.1.1)'             },
];

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
  Settings: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1.1 1.1M10.3 10.3l1.1 1.1M2.6 11.4l1.1-1.1M10.3 3.7l1.1-1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
  Server: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1.5" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="7.5" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="3.5" cy="3.5" r="0.75" fill="currentColor"/>
      <circle cx="3.5" cy="9.5" r="0.75" fill="currentColor"/>
    </svg>
  ),
};

/* ─── ScanCard ───────────────────────────────────────────────────────────── */
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
          const cls = i < step ? 'step-done' : i === step ? 'step-active' : 'step-queue';
          return (
            <div key={i} className={`scan-step ${cls}`}>
              <div className="step-icon">
                {i < step  && <Ico.Check />}
                {i === step && <span className="spin-light" />}
              </div>
              <div>
                <div className="step-label">{s.label}</div>
                <code className="step-cmd">{s.cmd}</code>
              </div>
              <div className="step-state">
                {i < step ? 'done' : i === step ? 'running' : 'queued'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

/* ─── StatusPill ─────────────────────────────────────────────────────────── */
const StatusPill = ({ status }) => {
  const MAP = {
    ok_a:        { label: 'OK · A record',  cls: 'sp-ok'      },
    ok_cname:    { label: 'OK · CNAME',     cls: 'sp-ok'      },
    cloudflare:  { label: 'Cloudflare CDN', cls: 'sp-warn'    },
    akamai:      { label: 'Akamai CDN',     cls: 'sp-warn'    },
    fastly:      { label: 'Fastly CDN',     cls: 'sp-warn'    },
    not_pointing:{ label: 'Not pointing',   cls: 'sp-error'   },
    cname_other: { label: 'CNAME (other)',  cls: 'sp-neutral' },
    no_dns:      { label: 'No DNS entry',   cls: 'sp-neutral' },
  };
  const c = MAP[status] ?? { label: status, cls: 'sp-neutral' };
  const dotCls = { 'sp-ok':'d-ok','sp-error':'d-error','sp-warn':'d-warn','sp-neutral':'d-neutral' }[c.cls];
  return (
    <span className={`spill ${c.cls}`}>
      <span className={`dot ${dotCls}`} />{c.label}
    </span>
  );
};

/* ─── EnvBadge ───────────────────────────────────────────────────────────── */
const EnvBadge = ({ env }) => {
  const cls = { prod:'eb-prod', dev:'eb-dev', test:'eb-test', stage:'eb-stage', dev2:'eb-dev' }[env] ?? 'eb-other';
  return <span className={`ebadge ${cls}`}>{env}</span>;
};

/* ─── DomainTable ────────────────────────────────────────────────────────── */
const DomainTable = ({ domains }) => (
  <div className="table-wrap">
    <table className="domain-table">
      <thead>
        <tr>
          <th>Domain</th><th>Status</th>
          <th>Expected IP</th><th>Actual IP</th><th>CNAME</th><th>Match</th>
        </tr>
      </thead>
      <tbody>
        {domains.map((d, i) => (
          <tr key={i}>
            <td className="td-domain">{d.domain}</td>
            <td><StatusPill status={d.status} /></td>
            <td className="td-ip">{d.expected_ip || '—'}</td>
            <td className={`td-ip ${d.matches ? 'td-ip-ok' : 'td-ip-fail'}`}>{d.actual_ip || '—'}</td>
            <td className="td-ip" style={{ fontSize:'0.68rem', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {d.cname || '—'}
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

/* ─── StatusCard ─────────────────────────────────────────────────────────── */
const StatusCard = ({ result }) => {
  const ok = result.all_repointed;
  return (
    <div className="card">
      <div className="status-banner">
        <div className="status-left">
          <div className={`status-glyph ${ok ? 'sg-ok' : 'sg-error'}`}>
            {ok ? <Ico.CheckCircle /> : <Ico.XCircle />}
          </div>
          <div>
            <div className="status-verdict">
              {ok ? 'DNS Repointing Complete' : 'DNS Repointing Incomplete'}
            </div>
            <div className="status-meta">
              Customer: <code>{result.customer}</code>
              {result.app_name && result.app_name !== result.customer && <> · {result.app_name}</>}
              &ensp;·&ensp;
              {result.total_domains} domain(s) across {result.environments.length} environment(s)
              {result.cdn_detected && <>&ensp;·&ensp;CDN detected</>}
            </div>
          </div>
        </div>
        <div className="status-chips">
          {result.environments.map(env => (
            <div key={env.name} className={`status-chip ${env.repointed ? 'chip-ok' : 'chip-error'}`}>
              <span className={`dot ${env.repointed ? 'd-ok' : 'd-error'}`} />
              {env.name} · <strong>{env.domains.length}</strong>
            </div>
          ))}
        </div>
      </div>
      {(result.issues.length > 0 || result.warnings.length > 0) && (
        <div className="issues-list">
          {result.issues.map((m, i) => (
            <div key={i} className="alert alert-error"><Ico.AlertTri />{m}</div>
          ))}
          {result.warnings.map((m, i) => (
            <div key={i} className="alert alert-warning"><Ico.AlertTri />{m}</div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── EnvGrid ────────────────────────────────────────────────────────────── */
const EnvGrid = ({ environments }) => (
  <div className="card">
    <div className="card-head">
      <span className="card-head-label"><Ico.Server /> Environments</span>
    </div>
    <div className="env-grid">
      {environments.map(env => {
        const typeTag = env.type === 'production' ? 'tag-dedicated' : 'tag-shared';
        return (
          <div key={env.name} className={`env-card ${env.repointed ? 'env-card-ok' : 'env-card-error'}`}>
            <div className="env-card-name">{env.name}</div>
            <div className="env-card-status">
              <span className={`dot ${env.repointed ? 'd-ok' : 'd-error'}`} />
              {env.repointed ? 'Repointed' : 'Not repointed'}
            </div>
            <div className="env-card-eip">{env.primary_ip || '—'}</div>
            <div className="env-card-bal">{env.label}</div>
            <span className={`type-tag ${typeTag}`}>{env.type || 'unknown'}</span>
          </div>
        );
      })}
    </div>
  </div>
);

/* ─── App ────────────────────────────────────────────────────────────────── */
export default function App() {
  const [customer,  setCustomer]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [scanStep,  setScanStep]  = useState(0);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  /* ── Scan step timing ── */
  useEffect(() => {
    if (!loading) { setScanStep(0); return; }
    const t = [
      setTimeout(() => setScanStep(1), 1200),
      setTimeout(() => setScanStep(2), 3500),
      setTimeout(() => setScanStep(3), 6000),
    ];
    return () => t.forEach(clearTimeout);
  }, [loading]);

  const runCheck = async () => {
    const name = customer.trim();
    if (!name) { setError('Enter an application name.'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await performCheck(name, setScanStep);
      setResult(data);
    } catch (e) {
      if (e.message === 'NOT_LOGGED_IN') {
        setError('Not signed in to Acquia Cloud. Sign in at cloud.acquia.com and try again.');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

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

        {/* ── Search ──────────────────────────────────────────────────── */}
        <div className="card">
          <div className="search-section">
            <div className="search-label">Application / Docroot Name</div>
            <div className="search-row">
              <div className="search-input-wrap">
                <span className="search-prefix">&gt;</span>
                <input
                  ref={inputRef}
                  className="search-input"
                  type="text"
                  value={customer}
                  onChange={e => { setCustomer(e.target.value); setError(null); setResult(null); }}
                  onKeyDown={e => e.key === 'Enter' && !loading && runCheck()}
                  placeholder="iqstudent"
                  disabled={loading}
                />
              </div>
              <button className="btn-primary" onClick={runCheck} disabled={loading}>
                {loading ? <><span className="spin" />Running…</> : <><Ico.Search />Run Check</>}
              </button>
            </div>
            <p className="search-hint">
              Application name only — no "@" prefix, no ".prod" suffix. E.g. <code>iqstudent</code>
            </p>
            {!loading && error && (
              <div className="alert alert-error" style={{ marginTop: 14 }}>
                <Ico.AlertTri />{error}
              </div>
            )}
          </div>
        </div>

        {/* ── Scan animation ──────────────────────────────────────────── */}
        {loading && <ScanCard step={scanStep} customer={customer.trim()} />}

        {/* ── Results ─────────────────────────────────────────────────── */}
        {!loading && result && (
          <>
            <StatusCard result={result} />
            <EnvGrid environments={result.environments} />
            <div className="card">
              <div className="card-head">
                <span className="card-head-label">
                  <Ico.List />Domain Check
                  <span className="count-badge">{result.total_domains}</span>
                </span>
                <span className="card-head-meta">Cloudflare DNS-over-HTTPS</span>
              </div>
              {result.environments.map(env => {
                if (env.domains.length === 0) return null;
                return (
                  <div key={env.name}>
                    <div className="domain-section-label">
                      <span className={`dot ${env.repointed ? 'd-ok' : 'd-error'}`} />
                      <EnvBadge env={env.name} />
                      <span style={{ color:'var(--t2)' }}>{env.domains.length} domain(s)</span>
                      {env.primary_ip && (
                        <code style={{ fontFamily:'var(--mono)', fontSize:'0.68rem', color:'var(--t3)' }}>
                          → {env.primary_ip}
                        </code>
                      )}
                    </div>
                    <DomainTable domains={env.domains} />
                  </div>
                );
              })}
              {result.environments.every(e => e.domains.length === 0) && (
                <div className="card-body" style={{ color:'var(--t2)', fontSize:'0.82rem' }}>
                  No customer domains found for this application.
                </div>
              )}
            </div>
          </>
        )}

      </main>
    </div>
  );
}
