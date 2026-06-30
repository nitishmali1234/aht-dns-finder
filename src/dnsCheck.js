/* ─── Free, anonymous DNS lookups ────────────────────────────
 * No Acquia API, no token, no login. Uses Google's public
 * DNS-over-HTTPS resolver (dns.google) — CORS-enabled, no auth,
 * no account needed. You supply the expected IP yourself (e.g.
 * from CCI); this just checks what a domain currently resolves
 * to and compares it.
 */

const DOH_URL = "https://dns.google/resolve";

export class DnsCheckError extends Error {}

async function resolveA(domain) {
  const url = `${DOH_URL}?name=${encodeURIComponent(domain)}&type=A`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/dns-json" } });
  } catch (e) {
    throw new DnsCheckError(`Cannot reach DNS resolver (${e.message}).`);
  }
  if (!res.ok) {
    throw new DnsCheckError(`DNS lookup failed (HTTP ${res.status}) for ${domain}`);
  }
  const data = await res.json();
  const answers = (data.Answer ?? []).filter((a) => a.type === 1); // A record
  return { status: data.Status, ips: answers.map((a) => a.data) };
}

export async function runDomainCheck(expectedIpRaw, domainsRaw, onProgress) {
  const expected = expectedIpRaw.trim();
  const domains = domainsRaw
    .split(/[\n,]/)
    .map((d) => d.trim())
    .filter(Boolean);

  if (!expected) return { success: false, error: "Enter the expected IP address." };
  if (domains.length === 0) return { success: false, error: "Enter at least one domain to check." };

  onProgress?.(0);

  const results = await Promise.all(
    domains.map(async (domain) => {
      try {
        const { status, ips } = await resolveA(domain);
        const matches = ips.includes(expected);
        let domainStatus, statusDetail;
        if (status === 3 || ips.length === 0) {
          domainStatus = "no_dns";
          statusDetail = "No DNS A record found";
        } else if (matches) {
          domainStatus = "ok_a";
          statusDetail = "OK - resolving to the expected IP";
        } else {
          domainStatus = "not_pointing";
          statusDetail = `Resolves to ${ips[0]}, not the expected IP`;
        }
        return {
          domain,
          expected_ip: expected,
          actual_ip: ips[0] ?? null,
          all_ips: ips,
          status: domainStatus,
          status_detail: statusDetail,
          matches,
        };
      } catch (e) {
        return {
          domain,
          expected_ip: expected,
          actual_ip: null,
          all_ips: [],
          status: "unknown",
          status_detail: e.message,
          matches: false,
        };
      }
    })
  );

  onProgress?.(1);

  const needAction = results.filter((d) => !d.matches).length;

  return {
    success: true,
    expected_ip: expected,
    domains: results,
    summary: {
      all_repointed: needAction === 0,
      total_domains: results.length,
      need_action: needAction,
    },
  };
}
