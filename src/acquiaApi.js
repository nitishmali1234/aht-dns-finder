/* ─── Acquia Cloud Platform API v2 client ────────────────────
 * Talks directly to cloud.acquia.com from inside the extension —
 * no local backend, no CLI, no API token. Auth is borrowed from
 * your existing logged-in Acquia Cloud UI browser session: every
 * request goes out with `credentials: "include"` so the browser
 * attaches whatever session cookie cloud.acquia.com already set
 * when you logged in there (Google SSO or otherwise).
 *
 * This is best-effort and unofficial — Acquia's public REST API is
 * documented as accepting only OAuth2 bearer tokens, not session
 * cookies. It works only if Acquia's API gateway happens to also
 * honor the UI session cookie for these endpoints, and only if that
 * cookie's SameSite policy permits it being sent on a cross-origin
 * request from a chrome-extension:// page. If it doesn't, every call
 * comes back 401/403 and there is no automatic fallback by design —
 * see error type NO_SESSION below.
 */

const API_BASE = "https://cloud.acquia.com/api";

export class AcquiaApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AcquiaApiError";
    this.status = status;
  }
}

async function apiGet(path) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: { Accept: "application/hal+json, application/json" },
    });
  } catch (e) {
    throw new AcquiaApiError(`Cannot reach Acquia Cloud (${e.message}).`, "NETWORK");
  }

  if (res.status === 401 || res.status === 403) {
    throw new AcquiaApiError(
      "Not signed in to Acquia Cloud. Log into cloud.acquia.com in this browser, then try again.",
      "NO_SESSION"
    );
  }
  if (!res.ok) {
    throw new AcquiaApiError(`Acquia API error (HTTP ${res.status}) for ${path}`, res.status);
  }
  return res.json();
}

/**
 * Finds an application by docroot/hosting name (the same name you'd
 * pass to `@name` with aht), e.g. "iqstudent".
 */
export async function findApplication(name) {
  const needle = name.trim().toLowerCase();

  // Try a server-side substring filter first (fast path).
  const filter = encodeURIComponent(`hosting.id=@*${needle}*`);
  let data = await apiGet(`/applications?filter=${filter}&limit=200`);
  let items = data._embedded?.items ?? [];

  let match = items.find((a) => {
    const hostingId = (a.hosting?.id ?? "").toLowerCase();
    const suffix = hostingId.includes(":") ? hostingId.split(":").pop() : hostingId;
    return suffix === needle;
  });

  if (match) return match;

  // Fall back to a fuller unfiltered scan (covers cases where the
  // server-side filter isn't supported on this field, or returned a
  // truncated set) — capped to keep this from running away on huge orgs.
  for (let offset = 0; offset < 1000; offset += 200) {
    data = await apiGet(`/applications?limit=200&offset=${offset}`);
    items = data._embedded?.items ?? [];
    match = items.find((a) => {
      const hostingId = (a.hosting?.id ?? "").toLowerCase();
      const suffix = hostingId.includes(":") ? hostingId.split(":").pop() : hostingId;
      return suffix === needle;
    });
    if (match) return match;
    if (items.length < 200) break; // last page
  }

  return null;
}

export async function getEnvironments(applicationUuid) {
  const data = await apiGet(`/applications/${applicationUuid}/environments`);
  return data._embedded?.items ?? [];
}

export async function getDomainStatus(environmentId, hostname) {
  return apiGet(`/environments/${environmentId}/domains/${encodeURIComponent(hostname)}/status`);
}

/**
 * Full DNS repointing check for one application, across all its
 * environments — the direct-API equivalent of the old
 * `aht @app a:i` + `aht server` + `aht @app dc` + `aht @app do:li`
 * pipeline, now done with parallel HTTPS calls instead of shelling
 * out to a local CLI.
 */
export async function runFullCheck(name, onProgress) {
  onProgress?.(0);
  const application = await findApplication(name);
  if (!application) {
    return {
      success: false,
      error_type: "invalid_docroot",
      error: `No Acquia application found matching "${name}". Verify the docroot name in CCI.`,
      customer: name,
    };
  }

  onProgress?.(1);
  const environments = await getEnvironments(application.uuid);
  if (environments.length === 0) {
    return {
      success: false,
      error_type: "invalid_docroot",
      error: "No environments found for this application.",
      customer: name,
    };
  }

  onProgress?.(2);

  const envEntries = await Promise.all(
    environments.map(async (env) => {
      const domainNames = env.domains ?? [];
      const domainStatuses = await Promise.all(
        domainNames.map(async (hostname) => {
          try {
            const status = await getDomainStatus(env.id, hostname);
            return { hostname, status, error: null };
          } catch (e) {
            return { hostname, status: null, error: e.message };
          }
        })
      );
      return { env, domainStatuses };
    })
  );

  onProgress?.(3);

  const domains = [];
  const balancerDetails = {};
  const envEips = {};

  for (const { env, domainStatuses } of envEntries) {
    const envName = env.name.toLowerCase();
    const expectedIps = env.ips ?? [];
    envEips[envName] = expectedIps[0] ?? null;

    balancerDetails[envName] = {
      label: env.label,
      eip: expectedIps[0] ?? null,
      all_eips: expectedIps,
      environment_id: env.id,
    };

    for (const { hostname, status, error } of domainStatuses) {
      if (error || !status) {
        domains.push({
          env: envName,
          domain: hostname,
          expected_ip: expectedIps[0] ?? null,
          actual_ip: null,
          status: "unknown",
          status_detail: error || "Could not fetch domain status",
          matches: false,
        });
        continue;
      }

      const actualIps = status.ip_addresses ?? [];
      const actualIp = actualIps[0] ?? null;
      const dnsResolves = status.flags?.dns_resolves;
      const acquiaHosted = status.flags?.acquia_hosted;
      const matches = !!actualIp && expectedIps.includes(actualIp);

      let domainStatus = "unknown";
      let statusDetail = "";
      if (!dnsResolves) {
        domainStatus = "no_dns";
        statusDetail = "No DNS entry found";
      } else if (matches) {
        domainStatus = "ok_a";
        statusDetail = "OK - resolving to the expected Acquia IP";
      } else if (acquiaHosted === false) {
        domainStatus = "not_pointing";
        statusDetail = "Not pointing at Acquia";
      } else {
        domainStatus = "unknown";
        statusDetail = `Resolves to ${actualIp || "an unexpected address"}, not the expected EIP`;
      }

      domains.push({
        env: envName,
        domain: hostname,
        expected_ip: expectedIps[0] ?? null,
        actual_ip: actualIp,
        status: domainStatus,
        status_detail: statusDetail,
        matches,
      });
    }
  }

  const prodDomains = domains.filter((d) => d.env === "prod");
  const nonProdDomains = domains.filter((d) => d.env !== "prod");

  const prodRepointed = prodDomains.length === 0 || prodDomains.every((d) => d.matches);
  const nonProdRepointed = nonProdDomains.length === 0 || nonProdDomains.every((d) => d.matches);

  const issues = [];
  const warnings = [];
  if (!prodRepointed && prodDomains.length) issues.push("❌ Production domains have NOT been repointed to the expected Acquia EIP");
  if (!nonProdRepointed && nonProdDomains.length) issues.push("❌ Non-production domains have NOT been repointed to the expected Acquia EIP");

  const summary = {
    all_repointed: prodRepointed && nonProdRepointed,
    prod_repointed: prodRepointed,
    non_prod_repointed: nonProdRepointed,
    total_domains: domains.length,
    prod_domains_count: prodDomains.length,
    non_prod_domains_count: nonProdDomains.length,
    issues,
    warnings,
    cdn_detected: false,
  };

  return {
    success: true,
    customer: name,
    application: { uuid: application.uuid, name: application.name, hosting_id: application.hosting?.id },
    environments: balancerDetails,
    eips: envEips,
    domains,
    domain_list: domains.map((d) => ({ domain: d.domain, raw_line: `${d.domain} (${d.env})` })),
    summary,
  };
}
