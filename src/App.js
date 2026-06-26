/* global chrome */
import { useState, useEffect, useRef } from "react";
import "./App.css";

/* ─── API constants ──────────────────────────────────────────────────────── */

const ACQUIA_API  = "https://cloud.acquia.com/api";
const CF_DNS      = "https://cloudflare-dns.com/dns-query";

/* ─── Token cache ────────────────────────────────────────────────────────── */

let _token   = null;
let _tokenExp = 0;

/* ─── Background service worker bridge ──────────────────────────────────── */
// All Acquia auth requests go through the service worker so the Origin header
// is "chrome-extension://..." rather than a page origin — Acquia may allow it.

function bgMsg(payload) {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(payload, r => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(r);
    })
  );
}

function parseAuthResp(resp) {
  if (!resp) throw new Error("No response from background worker.");
  let data = {};
  try { data = JSON.parse(resp.body || "{}"); } catch {}
  if (!resp.ok || !data.access_token) {
    const msg = data.error_description || data.message || data.error || resp.body || String(resp.status);
    throw new Error(`Auth failed (${resp.status}): ${msg}`);
  }
  return data;
}

async function authViaBackground(clientId, clientSecret) {
  const resp   = await bgMsg({ type: "ACQUIA_AUTH", clientId, clientSecret });
  const data   = parseAuthResp(resp);
  const expiry = Date.now() + ((data.expires_in ?? 7200) - 120) * 1000;
  await new Promise(ok => chrome.storage.local.set({
    acquia_client_id:     clientId,
    acquia_client_secret: clientSecret,
    acquia_token:         data.access_token,
    acquia_token_exp:     expiry,
    acquia_refresh:       data.refresh_token ?? null,
  }, ok));
  _token    = data.access_token;
  _tokenExp = expiry;
  return _token;
}

async function refreshViaBackground(clientId, refreshTok) {
  const resp   = await bgMsg({ type: "ACQUIA_REFRESH", clientId, refreshToken: refreshTok });
  const data   = parseAuthResp(resp);
  const expiry = Date.now() + ((data.expires_in ?? 7200) - 120) * 1000;
  await new Promise(ok => chrome.storage.local.set({
    acquia_token:     data.access_token,
    acquia_token_exp: expiry,
    acquia_refresh:   data.refresh_token ?? refreshTok,
  }, ok));
  _token    = data.access_token;
  _tokenExp = expiry;
  return _token;
}

/* ─── PKCE Authorization Code flow ──────────────────────────────────────── */

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const verifier  = b64url(arr.buffer);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

const ACQUIA_AUTH_URL = 'https://id.acquia.com/oauth2/default/v1/authorize';

async function launchPKCE(clientId) {
  const { verifier, challenge } = await generatePKCE();
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = ACQUIA_AUTH_URL + '?' + new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectUri,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state:                 b64url(crypto.getRandomValues(new Uint8Array(8)).buffer),
  });
  const result = await new Promise((resolve, reject) =>
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, url => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!url) reject(new Error("Authorization was cancelled."));
      else resolve(url);
    })
  );
  const params = new URL(result).searchParams;
  if (params.get('error')) throw new Error(params.get('error_description') || params.get('error'));
  const code = params.get('code');
  if (!code) throw new Error("No authorization code returned.");
  return { code, verifier, redirectUri };
}

async function exchangePKCECode(clientId, code, codeVerifier, redirectUri) {
  const resp = await bgMsg({ type: 'ACQUIA_CODE_EXCHANGE', clientId, code, codeVerifier, redirectUri });
  return parseAuthResp(resp);
}

/* ─── Get token: memory → storage → refresh → re-auth → NEEDS_AUTH ──────── */

async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token;

  const stored = await new Promise(ok =>
    chrome.storage.local.get(
      ["acquia_token", "acquia_token_exp", "acquia_refresh",
       "acquia_client_id", "acquia_client_secret"], ok
    )
  );

  if (stored.acquia_token && stored.acquia_token_exp > Date.now() + 60_000) {
    _token    = stored.acquia_token;
    _tokenExp = stored.acquia_token_exp;
    return _token;
  }

  if (stored.acquia_refresh && stored.acquia_client_id) {
    try { return await refreshViaBackground(stored.acquia_client_id, stored.acquia_refresh); }
    catch {}
  }

  if (stored.acquia_client_id && stored.acquia_client_secret) {
    try { return await authViaBackground(stored.acquia_client_id, stored.acquia_client_secret); }
    catch {}
  }

  throw new Error("NEEDS_AUTH");
}


/* ─── Acquia Cloud API helpers ───────────────────────────────────────────── */

async function acqGet(token, path) {
  let res;
  try {
    res = await fetch(`${ACQUIA_API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch (netErr) {
    throw new Error(`Network error: ${netErr.message}`);
  }
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    try {
      const j = JSON.parse(body);
      body = j.message || j.error || body;
    } catch {}
    throw new Error(`Acquia API error (${res.status}) on ${path}: ${body || res.statusText}`);
  }
  return res.json();
}

async function findApp(token, name) {
  // Try exact filter first
  try {
    const d = await acqGet(token, `/applications?filter=hosting_id%3D${encodeURIComponent(name)}&sort=name`);
    const items = d._embedded?.items || [];
    if (items.length) return items[0];
  } catch {}

  // Fall back to listing first 100 and matching by docroot suffix
  const d = await acqGet(token, "/applications?sort=name&limit=100");
  const all = d._embedded?.items || [];
  const match = all.find(a => {
    const docroot = (a.hosting?.id || "").split(":").pop();
    return docroot === name || (a.name || "").toLowerCase() === name.toLowerCase();
  });
  if (match) return match;
  throw new Error(`Application "${name}" not found. Verify the docroot name.`);
}

async function getEnvs(token, appUuid) {
  const d = await acqGet(token, `/applications/${appUuid}/environments`);
  return d._embedded?.items || [];
}

async function getEnvDomains(token, envUuid) {
  try {
    const d = await acqGet(token, `/environments/${envUuid}/domains`);
    return (d._embedded?.items || [])
      .map(i => i.hostname || i.name || i.domain)
      .filter(Boolean);
  } catch { return []; }
}

/* ─── DNS-over-HTTPS (Cloudflare 1.1.1.1) ───────────────────────────────── */

async function resolveDomain(domain) {
  const [aData, cData] = await Promise.all([
    fetch(`${CF_DNS}?name=${encodeURIComponent(domain)}&type=A`,     { headers: { Accept: "application/dns-json" } }).then(r => r.json()).catch(() => null),
    fetch(`${CF_DNS}?name=${encodeURIComponent(domain)}&type=CNAME`, { headers: { Accept: "application/dns-json" } }).then(r => r.json()).catch(() => null),
  ]);
  const ips    = (aData?.Answer || []).filter(a => a.type === 1).map(a => a.data);
  const cnames = [
    ...(aData?.Answer  || []).filter(a => a.type === 5),
    ...(cData?.Answer  || []).filter(a => a.type === 5),
  ].map(a => a.data.replace(/\.$/, "")).filter((v, i, arr) => arr.indexOf(v) === i);
  return { ips, cnames };
}

function dnsStatus(ips, cnames, expectedIPs) {
  if (!ips.length && !cnames.length) return "no_dns";
  if (expectedIPs.length && ips.some(ip => expectedIPs.includes(ip))) return "ok_a";
  const all = [...ips, ...cnames].join(" ").toLowerCase();
  if (all.includes("cloudflare") || cnames.some(c => /\.cloudflare\.net$/.test(c))) return "cloudflare";
  if (all.includes("akamai") || all.includes("edgekey") || all.includes("akamaiedge"))  return "akamai";
  if (all.includes("fastly")) return "fastly";
  if (cnames.some(c => c.includes("acquia-sites") || c.includes("acquia.com"))) return "ok_cname";
  if (cnames.length) return "cname_other";
  if (ips.length)    return "not_pointing";
  return "no_dns";
}

/* ─── Main check ─────────────────────────────────────────────────────────── */

const OK_STATUSES = new Set(["ok_a", "ok_cname", "cloudflare", "akamai", "fastly"]);

async function performCheck(appName, onStep) {
  onStep(0);
  const token = await getToken();

  onStep(1);
  const app     = await findApp(token, appName);
  const envList = await getEnvs(token, app.uuid);

  onStep(2);
  const envDomainsList = await Promise.all(
    envList.map(env => getEnvDomains(token, env.uuid || env.id))
  );

  onStep(3);
  // Flatten all domains for parallel DNS resolution
  const tasks = [];
  envList.forEach((env, i) => {
    const expectedIPs = env.ips || [];
    envDomainsList[i].forEach(domain => {
      if (domain.endsWith(".acquia-sites.com") || domain.endsWith(".acquia.com")) return;
      tasks.push({ env, domain, expectedIPs });
    });
  });

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

  // Group by environment
  const environments = envList.map(env => {
    const domains    = dnsResults.filter(d => d.env === env.name);
    const repointed  = domains.length === 0 || domains.every(d => OK_STATUSES.has(d.status));
    return {
      name:       env.name,
      label:      env.label || env.name,
      ips:        env.ips || [],
      primary_ip: (env.ips || [])[0] || null,
      type:       env.type || (env.name === "prod" ? "production" : "non-production"),
      repointed,
      domains,
    };
  });

  const allRepointed = environments.every(e => e.repointed);
  const cdnDomains   = dnsResults.filter(d => ["cloudflare", "akamai", "fastly"].includes(d.status));

  const issues   = environments
    .filter(e => !e.repointed && e.domains.length > 0)
    .map(e => `${e.label} domains have NOT been repointed`);
  const warnings = [];
  if (cdnDomains.length)
    warnings.push(`${cdnDomains.length} domain(s) use a CDN — verify origin is pointing to the correct Acquia IP`);
  const uniqueIPs = new Set(environments.map(e => e.primary_ip).filter(Boolean));
  if (uniqueIPs.size > 1)
    warnings.push("Different IPs across environments — share the correct IP per environment with the customer");

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
  { label: "Authenticating with Acquia",  cmd: "POST accounts.acquia.com/api/auth/oauth/token"   },
  { label: "Fetching application info",   cmd: "GET  cloud.acquia.com/api/applications/…/environments" },
  { label: "Loading domain lists",        cmd: "GET  cloud.acquia.com/api/environments/…/domains" },
  { label: "Resolving DNS records",       cmd: "Cloudflare DNS-over-HTTPS (1.1.1.1)"              },
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
  Key: () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="5.5" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8.5 7.5H14M12 5.5V7.5M14 5.5V7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Settings: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1.1 1.1M10.3 10.3l1.1 1.1M2.6 11.4l1.1-1.1M10.3 3.7l1.1-1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
          const cls = i < step ? "step-done" : i === step ? "step-active" : "step-queue";
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
                {i < step ? "done" : i === step ? "running" : "queued"}
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
    ok_a:        { label: "OK · A record",   cls: "sp-ok"      },
    ok_cname:    { label: "OK · CNAME",      cls: "sp-ok"      },
    cloudflare:  { label: "Cloudflare CDN",  cls: "sp-warn"    },
    akamai:      { label: "Akamai CDN",      cls: "sp-warn"    },
    fastly:      { label: "Fastly CDN",      cls: "sp-warn"    },
    not_pointing:{ label: "Not pointing",    cls: "sp-error"   },
    cname_other: { label: "CNAME (other)",   cls: "sp-neutral" },
    no_dns:      { label: "No DNS entry",    cls: "sp-neutral" },
  };
  const c = MAP[status] ?? { label: status, cls: "sp-neutral" };
  const dotCls = { "sp-ok":"d-ok","sp-error":"d-error","sp-warn":"d-warn","sp-neutral":"d-neutral" }[c.cls];
  return (
    <span className={`spill ${c.cls}`}>
      <span className={`dot ${dotCls}`} />{c.label}
    </span>
  );
};

/* ─── EnvBadge ───────────────────────────────────────────────────────────── */

const EnvBadge = ({ env }) => {
  const cls = { prod:"eb-prod", dev:"eb-dev", test:"eb-test", stage:"eb-stage", dev2:"eb-dev" }[env] ?? "eb-other";
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
            <td className="td-ip">{d.expected_ip || "—"}</td>
            <td className={`td-ip ${d.matches ? "td-ip-ok" : "td-ip-fail"}`}>{d.actual_ip || "—"}</td>
            <td className="td-ip" style={{ fontSize:"0.68rem", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {d.cname || "—"}
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
          <div className={`status-glyph ${ok ? "sg-ok" : "sg-error"}`}>
            {ok ? <Ico.CheckCircle /> : <Ico.XCircle />}
          </div>
          <div>
            <div className="status-verdict">
              {ok ? "DNS Repointing Complete" : "DNS Repointing Incomplete"}
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
            <div key={env.name} className={`status-chip ${env.repointed ? "chip-ok" : "chip-error"}`}>
              <span className={`dot ${env.repointed ? "d-ok" : "d-error"}`} />
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
        const typeTag = env.type === "production" ? "tag-dedicated" : "tag-shared";
        return (
          <div key={env.name} className={`env-card ${env.repointed ? "env-card-ok" : "env-card-error"}`}>
            <div className="env-card-name">{env.name}</div>
            <div className="env-card-status">
              <span className={`dot ${env.repointed ? "d-ok" : "d-error"}`} />
              {env.repointed ? "Repointed" : "Not repointed"}
            </div>
            <div className="env-card-eip">{env.primary_ip || "—"}</div>
            <div className="env-card-bal">{env.label}</div>
            <span className={`type-tag ${typeTag}`}>{env.type || "unknown"}</span>
          </div>
        );
      })}
    </div>
  </div>
);

/* ─── Settings / Connect page ────────────────────────────────────────────── */

// phase: "form" | "trying" | "device_waiting" | "done"
const SettingsPage = ({ onSave, clientId: existingId }) => {
  const [clientId,     setClientId]     = useState(existingId || "");
  const [clientSecret, setClientSecret] = useState("");
  const [phase,        setPhase]        = useState("form");
  const [statusMsg,    setStatusMsg]    = useState("");
  const [deviceInfo,   setDeviceInfo]   = useState(null);
  const [polls,        setPollCount]    = useState(0);
  const [err,          setErr]          = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  /* ── Device poll loop ── */
  const schedulePoll = (id, deviceCode, intervalSec, deadline) => {
    timerRef.current = setTimeout(async () => {
      if (Date.now() > deadline) {
        setErr("Code expired — click back and try again."); setPhase("form"); return;
      }
      setPollCount(n => n + 1);
      const resp = await bgMsg({ type: "ACQUIA_DEVICE_POLL", clientId: id, deviceCode });
      if (!resp) { schedulePoll(id, deviceCode, intervalSec, deadline); return; }
      let d = {};
      try { d = JSON.parse(resp.body); } catch {}

      if (d.access_token) {
        const expiry = Date.now() + ((d.expires_in ?? 7200) - 120) * 1000;
        await new Promise(ok => chrome.storage.local.set({
          acquia_client_id: id, acquia_token: d.access_token,
          acquia_token_exp: expiry, acquia_refresh: d.refresh_token ?? null,
        }, ok));
        _token = d.access_token; _tokenExp = expiry;
        onSave(id); return;
      }
      if (d.error === "authorization_pending") { schedulePoll(id, deviceCode, intervalSec, deadline); return; }
      if (d.error === "slow_down")             { schedulePoll(id, deviceCode, intervalSec + 5, deadline); return; }
      if (d.error === "expired_token")         { setErr("Code expired — try again."); setPhase("form"); return; }
      if (d.error === "access_denied")         { setErr("Authorization denied."); setPhase("form"); return; }
      if (d.error) { setErr(d.error_description || d.error); setPhase("form"); return; }
      schedulePoll(id, deviceCode, intervalSec, deadline);
    }, intervalSec * 1000);
  };

  /* ── Device flow start ── */
  const startDeviceFlow = async (id) => {
    setStatusMsg("Starting device authorization…");
    const resp = await bgMsg({ type: "ACQUIA_DEVICE_START", clientId: id });
    let d = {};
    try { d = JSON.parse(resp?.body || "{}"); } catch {}
    if (!resp?.ok || !d.device_code) {
      const msg = d.error_description || d.error || resp?.body || `Status ${resp?.status}`;
      throw new Error(msg);
    }
    setDeviceInfo(d);
    setPhase("device_waiting");
    schedulePoll(id, d.device_code, d.interval || 5, Date.now() + (d.expires_in || 300) * 1000);
  };

  /* ── Direct PKCE attempt (used after redirect URI has been registered) ── */
  const tryPKCE = async (id) => {
    if (!id) { setErr("Enter your Acquia Client ID."); setPhase("form"); return; }
    setErr(null); setPhase("trying"); setStatusMsg("Opening Acquia login…");
    try {
      const { code, verifier, redirectUri: ru } = await launchPKCE(id);
      setStatusMsg("Completing sign-in…");
      const data   = await exchangePKCECode(id, code, verifier, ru);
      const expiry = Date.now() + ((data.expires_in ?? 7200) - 120) * 1000;
      await new Promise(ok => chrome.storage.local.set({
        acquia_client_id: id, acquia_token: data.access_token,
        acquia_token_exp: expiry, acquia_refresh: data.refresh_token ?? null,
      }, ok));
      _token = data.access_token; _tokenExp = expiry;
      onSave(id);
    } catch (e) {
      const isRedirectIssue = /could not be loaded|not approve|cancelled|closed/i.test(e.message);
      if (isRedirectIssue) { setPhase("redirect_needed"); return; }
      setErr(e.message); setPhase("form");
    }
  };

  /* ── Connect button handler — cascades: client_credentials → device_code → PKCE ── */
  const connect = async () => {
    const id  = clientId.trim();
    const sec = clientSecret.trim();
    if (!id) { setErr("Enter your Acquia Client ID."); return; }
    setErr(null); setPhase("trying");

    /* 1. client_credentials — fast, silent, needs secret */
    if (sec) {
      setStatusMsg("Trying API key auth…");
      try {
        await authViaBackground(id, sec);
        onSave(id); return;
      } catch (e) {
        const wrongSecret = /\b401\b/.test(e.message) && !/pkce|proof key|unauthorized_client/i.test(e.message);
        if (wrongSecret) { setErr(e.message); setPhase("form"); return; }
        /* 403 or grant-type-not-allowed → continue */
      }
    }

    /* 2. Device Code — no redirect URI needed */
    setStatusMsg("Trying device flow…");
    try {
      await startDeviceFlow(id);
      return; // sets phase to device_waiting if it worked
    } catch {
      /* 403 / not enabled → fall through to PKCE */
    }

    /* 3. PKCE Authorization Code — opens Acquia login in a popup */
    setStatusMsg("Opening Acquia login…");
    try {
      const { code, verifier, redirectUri } = await launchPKCE(id);
      setStatusMsg("Completing sign-in…");
      const data   = await exchangePKCECode(id, code, verifier, redirectUri);
      const expiry = Date.now() + ((data.expires_in ?? 7200) - 120) * 1000;
      await new Promise(ok => chrome.storage.local.set({
        acquia_client_id: id, acquia_token: data.access_token,
        acquia_token_exp: expiry, acquia_refresh: data.refresh_token ?? null,
      }, ok));
      _token = data.access_token; _tokenExp = expiry;
      onSave(id);
    } catch (e) {
      const isRedirectIssue = /could not be loaded|not approve|cancelled|closed/i.test(e.message);
      if (isRedirectIssue) { setPhase("redirect_needed"); return; }
      setErr(e.message); setPhase("form");
    }
  };

  const goBack = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("form"); setDeviceInfo(null); setErr(null); setPollCount(0);
  };

  /* ── Redirect URI setup guide ── */
  const redirectUri = chrome.identity.getRedirectURL();
  if (phase === "redirect_needed") return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-icon"><Ico.Network /></div>
          <span className="topbar-title">Acquia DNS Finder</span>
          <div className="topbar-right"><span className="topbar-tag">Setup</span></div>
        </div>
      </header>
      <main className="main" style={{ maxWidth: 580 }}>
        <div className="card">
          <div className="card-head"><span className="card-head-label"><Ico.Key /> One-Time Setup Required</span></div>
          <div className="card-body">
            <p className="settings-intro">
              The login popup opened but Acquia blocked the return URL. You need to register
              this extension's callback URI in your Acquia API token — it's a one-time step.
            </p>

            <div className="auth-step-box">
              <div className="auth-step-label">Step 1 — Copy this Callback URI</div>
              <div className="auth-step-url" style={{ wordBreak:"break-all" }}>{redirectUri}</div>
              <button className="btn-ghost" style={{ marginTop:10, fontSize:"0.78rem" }}
                onClick={() => navigator.clipboard.writeText(redirectUri)}>
                Copy to clipboard
              </button>
            </div>

            <div className="auth-step-box" style={{ marginTop:14 }}>
              <div className="auth-step-label">Step 2 — Add it to your Acquia API token</div>
              <ol style={{ paddingLeft:18, lineHeight:1.9, fontSize:"0.84rem", color:"var(--t1)", marginTop:8 }}>
                <li>Go to <strong>cloud.acquia.com</strong></li>
                <li>Click your name (top-right) → <strong>Account settings</strong></li>
                <li>Click <strong>API tokens</strong></li>
                <li>Click your token name to edit it</li>
                <li>Find the <strong>Callback URLs</strong> (or Redirect URIs) field</li>
                <li>Paste the URI above and save</li>
              </ol>
            </div>

            <button className="btn-primary" style={{ width:"100%", marginTop:18 }}
              onClick={() => tryPKCE(clientId.trim())}>
              I've added it — Try Again
            </button>
            <button className="btn-ghost" style={{ width:"100%", marginTop:10 }} onClick={goBack}>
              ← Back
            </button>
          </div>
        </div>
      </main>
    </div>
  );

  /* ── Device waiting UI ── */
  if (phase === "device_waiting" && deviceInfo) return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-icon"><Ico.Network /></div>
          <span className="topbar-title">Acquia DNS Finder</span>
          <div className="topbar-right"><span className="topbar-tag">Authorizing</span></div>
        </div>
      </header>
      <main className="main" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-head"><span className="card-head-label"><Ico.Key /> Authorize in Acquia</span></div>
          <div className="card-body">
            <p className="settings-intro">
              Open the link below and enter the code when prompted. The extension will connect automatically once you approve.
            </p>

            <div className="auth-step-box">
              <div className="auth-step-label">Step 1 — Open this URL in your browser</div>
              <div className="auth-step-url">{deviceInfo.verification_uri}</div>
              <button className="btn-ghost" style={{ marginTop:10, fontSize:"0.78rem" }}
                onClick={() => chrome.tabs.create({ url: deviceInfo.verification_uri_complete || deviceInfo.verification_uri })}>
                Open in new tab →
              </button>
            </div>

            <div className="auth-step-box" style={{ marginTop:14, textAlign:"center" }}>
              <div className="auth-step-label">Step 2 — Enter this code</div>
              <div className="auth-step-code">{deviceInfo.user_code}</div>
            </div>

            <div className="auth-step-status">
              <span className="spin-light" />
              Waiting for approval… <span style={{ color:"var(--t3)" }}>({polls} check{polls !== 1 ? "s" : ""})</span>
            </div>

            {err && <div className="alert alert-error" style={{ marginTop:14 }}><Ico.AlertTri />{err}</div>}
            <button className="btn-ghost" style={{ width:"100%", marginTop:14 }} onClick={goBack}>← Back</button>
          </div>
        </div>
      </main>
    </div>
  );

  /* ── Main form ── */
  const busy = phase === "trying";
  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-icon"><Ico.Network /></div>
          <span className="topbar-title">Acquia DNS Finder</span>
          <div className="topbar-right"><span className="topbar-tag">Setup</span></div>
        </div>
      </header>
      <main className="main" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-head"><span className="card-head-label"><Ico.Key /> Connect Acquia Account</span></div>
          <div className="card-body">
            <p className="settings-intro">
              Enter your Acquia API credentials. The extension tries API key auth first; if that's blocked it switches to a browser-based device flow automatically.
            </p>

            <div className="settings-field">
              <label className="settings-field-label">Client ID</label>
              <input className="settings-input" type="text"
                placeholder="e62adfc6-c7ee-403b-ba40-172c90e792cf"
                value={clientId} autoFocus
                onChange={e => { setClientId(e.target.value); setErr(null); }}
                onKeyDown={e => e.key === "Enter" && !busy && connect()} />
            </div>

            <div className="settings-field">
              <label className="settings-field-label">Client Secret <span style={{ color:"var(--t3)", fontWeight:400 }}>(optional — for faster auth)</span></label>
              <input className="settings-input" type="password"
                placeholder="Leave blank to use browser-based login"
                value={clientSecret}
                onChange={e => { setClientSecret(e.target.value); setErr(null); }}
                onKeyDown={e => e.key === "Enter" && !busy && connect()} />
            </div>

            {err && <div className="alert alert-error" style={{ marginBottom:14 }}><Ico.AlertTri />{err}</div>}

            <button className="btn-primary" style={{ width:"100%" }} onClick={connect} disabled={busy}>
              {busy ? <><span className="spin" />{statusMsg || "Connecting…"}</> : <>Connect with Acquia</>}
            </button>

            <div className="settings-how">
              <strong style={{ color:"var(--t1)", display:"block", marginBottom:8 }}>How to find your credentials</strong>
              <ol>
                <li>Go to <strong>cloud.acquia.com</strong></li>
                <li>Click your name (top-right) → <strong>Account settings</strong></li>
                <li>Click <strong>API tokens</strong> → <strong>Create token</strong></li>
                <li>Copy the <strong>Key</strong> (Client ID) and optionally the <strong>Secret</strong></li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

/* ─── App ────────────────────────────────────────────────────────────────── */

export default function App() {
  // undefined=loading, null=not connected, string=client_id (connected)
  const [creds,    setCreds]    = useState(undefined);
  const [customer, setCustomer] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Load token from Chrome storage on mount
  useEffect(() => {
    chrome.storage.local.get(
      ["acquia_client_id", "acquia_client_secret", "acquia_token", "acquia_token_exp"],
      ({ acquia_client_id, acquia_client_secret, acquia_token, acquia_token_exp }) => {
        if (acquia_token && acquia_token_exp > Date.now() && acquia_client_id) {
          _token    = acquia_token;
          _tokenExp = acquia_token_exp;
          setCreds(acquia_client_id);
        } else if (acquia_client_id && acquia_client_secret) {
          // Have credentials but token expired — mark as connected; getToken() will re-auth
          setCreds(acquia_client_id);
        } else {
          setCreds(null);
        }
      }
    );
  }, []);

  // Scan step animation
  useEffect(() => {
    if (!loading) { setScanStep(0); return; }
    const t = [
      setTimeout(() => setScanStep(1), 1500),
      setTimeout(() => setScanStep(2), 4000),
      setTimeout(() => setScanStep(3), 7000),
    ];
    return () => t.forEach(clearTimeout);
  }, [loading]);

  const signOut = () => {
    _token = null; _tokenExp = 0;
    chrome.storage.local.remove(["acquia_client_id", "acquia_client_secret", "acquia_token", "acquia_token_exp", "acquia_refresh"]);
    setCreds(null); setShowSettings(false); setResult(null); setError(null);
  };

  const runCheck = async () => {
    const name = customer.trim();
    if (!name) { setError("Enter an application name."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await performCheck(name, setScanStep);
      setResult(data);
    } catch (e) {
      if (e.message === "NEEDS_AUTH") {
        setCreds(null); // token expired and refresh failed — re-login
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Still checking storage
  if (creds === undefined) return (
    <div className="page" style={{ alignItems:"center", justifyContent:"center", display:"flex", height:"100vh" }}>
      <span className="spin-light" style={{ width:24, height:24, borderWidth:3 }} />
    </div>
  );

  // Not connected yet, or user clicked "Reconnect"
  if (creds === null || showSettings) return (
    <SettingsPage
      clientId={typeof creds === "string" ? creds : ""}
      onSave={id => { setCreds(id); setShowSettings(false); }}
    />
  );

  return (
    <div className="page">

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-icon"><Ico.Network /></div>
          <span className="topbar-title">Acquia DNS Finder</span>
          <div className="topbar-right">
            <button className="btn-ghost" onClick={signOut}>
              <Ico.Settings />Reconnect
            </button>
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
                  className="search-input"
                  type="text"
                  value={customer}
                  onChange={e => { setCustomer(e.target.value); setError(null); setResult(null); }}
                  onKeyDown={e => e.key === "Enter" && !loading && runCheck()}
                  placeholder="iqstudent"
                  disabled={loading}
                  autoFocus
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

            {/* Domain check — one section per environment */}
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
                      <span className={`dot ${env.repointed ? "d-ok" : "d-error"}`} />
                      <EnvBadge env={env.name} />
                      <span style={{ color:"var(--t2)" }}>{env.domains.length} domain(s)</span>
                      {env.primary_ip && (
                        <code style={{ fontFamily:"var(--mono)", fontSize:"0.68rem", color:"var(--t3)" }}>
                          → {env.primary_ip}
                        </code>
                      )}
                    </div>
                    <DomainTable domains={env.domains} />
                  </div>
                );
              })}

              {result.environments.every(e => e.domains.length === 0) && (
                <div className="card-body" style={{ color:"var(--t2)", fontSize:"0.82rem" }}>
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
