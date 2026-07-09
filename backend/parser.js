/**
 * Parses a single header line's bracket contents by LABEL, not position.
 * Real-world header lines don't always have the same number/order of
 * brackets — some include an extra [Display Name: ...] or an unlabeled
 * tag like [Edge Cluster] before [Provider: ...]. Matching brackets by
 * their own prefix (rather than assuming bracket #2 is always Revision,
 * etc.) keeps this correct regardless of how many extra brackets appear.
 */
function parseHeaderBrackets(headerLine) {
  const brackets = [];
  const bracketRegex = /\[([^\]]+)\]/g;
  let match;
  while ((match = bracketRegex.exec(headerLine)) !== null) {
    brackets.push(match[1].trim());
  }

  const info = {
    environment: null,
    sitename: null,
    displayName: null,
    revision: null,
    php: null,
    applicationType: null,
    provider: null,
    tags: []
  };

  if (brackets.length === 0) return info;

  // The first bracket is always "envKey: sitename"
  const envMatch = brackets[0].match(/^(\S+):\s*(.+)$/);
  if (envMatch) {
    info.environment = envMatch[1].trim();
    info.sitename = envMatch[2].trim();
  } else {
    info.environment = brackets[0];
  }

  // Every other bracket is matched by its own label, regardless of position
  for (let i = 1; i < brackets.length; i++) {
    const b = brackets[i];
    let m;
    if ((m = b.match(/^Display Name:\s*(.+)$/i))) {
      info.displayName = m[1].trim();
    } else if ((m = b.match(/^Revision:\s*(.+)$/i))) {
      info.revision = m[1].trim();
    } else if ((m = b.match(/^PHP\s+(.+)$/i))) {
      info.php = m[1].trim();
    } else if ((m = b.match(/^Application type:\s*(.+)$/i))) {
      info.applicationType = m[1].trim();
    } else if ((m = b.match(/^Provider:\s*(.+)$/i))) {
      info.provider = m[1].trim();
    } else {
      // Unlabeled tag, e.g. "Edge Cluster"
      info.tags.push(b);
    }
  }

  return info;
}

/**
 * Parses the raw output of `aht @app.env application:info`.
 *
 * Some applications (typically ACSF/multi-environment sites) return one
 * header+host block PER ENVIRONMENT in a single response — e.g. ra, prod,
 * test, dev all in one call. Each block is parsed separately so they don't
 * get merged into one giant repeated host list. `entitlements` is parsed
 * once since it applies to the whole site, not per-environment.
 */
function parseApplicationInfo(raw) {
  const result = {
    environments: [],
    entitlements: []
  };

  const lines = raw.split('\n');

  // Each environment block starts with a header line like
  // "[ra: niehsntpra] [Display Name: Ra] ..."
  const headerIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('[')) {
      headerIndices.push(i);
    }
  }

  for (let h = 0; h < headerIndices.length; h++) {
    const startIdx = headerIndices[h];
    const endIdx = h + 1 < headerIndices.length ? headerIndices[h + 1] : lines.length;
    const blockLines = lines.slice(startIdx, endIdx);

    const info = parseHeaderBrackets(blockLines[0]);
    const hosts = [];
    const footnotes = [];

    for (let i = 1; i < blockLines.length; i++) {
      const trimmed = blockLines[i].trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('WARNING')) continue;
      if (trimmed.includes('Entitlements:')) break; // entitlements section starts here — stop this block
      if (trimmed.match(/^[*†]/)) {
        footnotes.push(trimmed);
        continue;
      }
      if (trimmed.match(/^(nlb|bal|web|dbmaster|fs|svn|ded|staging|managed)(-\w+)?\s/)) {
        const host = parseHostLine(blockLines[i]);
        if (host) hosts.push(host);
      }
    }

    result.environments.push({ info, hosts, footnotes });
  }

  // Parse entitlements.
  // Lines may have a second column with the account/customer name, e.g.
  // "- Acquia Search                           BORN Group Ltd."
  // separated by a run of 2+ spaces (same convention as domains:check).
  // Only the entitlement name itself (first column) is kept.
  const entitlementStart = lines.findIndex(line => line.includes('Entitlements:'));
  if (entitlementStart !== -1) {
    for (let i = entitlementStart + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('WARNING')) break;
      if (line.startsWith('*') || line.startsWith('†')) continue;
      const withoutDash = line.startsWith('-') ? line.replace(/^-\s*/, '') : line;
      const name = withoutDash.split(/\s{2,}/)[0].trim();
      if (name) {
        result.entitlements.push(name);
      }
    }
  }

  // If entitlements section wasn't found with "Entitlements:" header,
  // try to find standalone entitlement names anywhere in the output
  if (result.entitlements.length === 0) {
    const knownEntitlements = [
      'Acquia Search', 'Acquia Search Stax', 'Acsf', 'Experience',
      'New Relic', 'Personalization', 'Platform Email', 'Remote Ide',
      'Site Studio', 'Cloud IDE', 'Shield', 'Acquia DAM'
    ];
    for (const line of lines) {
      const trimmed = line.trim();
      const match = knownEntitlements.find(e => trimmed.startsWith(e));
      if (match) {
        const name = trimmed.split(/\s{2,}/)[0].trim();
        result.entitlements.push(name);
      }
    }
  }

  return result;
}

/**
 * Parses a single host line from application:info output
 */
function parseHostLine(line) {
  // Remove flag characters but track them
  const flags = [];
  if (line.includes('*')) flags.push('not_in_rotation');
  if (line.includes('†')) flags.push('web_inactive');

  // Clean the line of flag characters for easier parsing
  const cleaned = line.replace(/[*†]/g, ' ');
  const parts = cleaned.trim().split(/\s+/).filter(Boolean);

  if (parts.length < 2) return null;

  const host = {
    name: parts[0],
    tier: null,
    ip: null,
    type: null,
    az: null,
    os: null,
    vpc: null,
    mem: null,
    hostname: null,
    flags: flags
  };

  // Known tier values
  const tierValues = ['dedicated', 'shared', 'premium'];
  // IP regex
  const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  // Instance type regex (e.g., m6a.large, c5a.2xlarge)
  const instanceRegex = /^[a-z]\d[a-z]?\.\w+$/;
  // AZ regex (e.g., us-east-1b)
  const azRegex = /^[a-z]{2}-[a-z]+-\d[a-z]$/;
  // OS names
  const osNames = ['xenial', 'bionic', 'focal', 'jammy', 'noble'];
  // VPC regex
  const vpcRegex = /^vpc:\d+$/;
  // Memory regex
  const memRegex = /^m:\d+M$/;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    if (tierValues.includes(part.toLowerCase()) && !host.tier) {
      host.tier = part;
    } else if (ipRegex.test(part) && !host.ip) {
      host.ip = part;
    } else if (instanceRegex.test(part) && !host.type) {
      host.type = part;
    } else if (azRegex.test(part) && !host.az) {
      host.az = part;
    } else if (osNames.includes(part.toLowerCase()) && !host.os) {
      host.os = part;
    } else if (vpcRegex.test(part) && !host.vpc) {
      host.vpc = part;
    } else if (memRegex.test(part) && !host.mem) {
      host.mem = part;
    } else if (part.includes('.') && !ipRegex.test(part) && !host.hostname) {
      // e.g. the target hostname shown on nlb (load balancer) rows
      host.hostname = part;
    }
  }

  return host;
}

/**
 * Parses the raw output of `aht @app.env domains:list`
 */
function parseDomainsList(raw) {
  const result = {
    domains: []
  };

  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Domain lines typically look like: domain.example.com
    // or may have additional columns (type, status)
    if (!trimmed) continue;
    if (trimmed.startsWith('WARNING')) continue;
    if (trimmed.startsWith('[')) continue;
    if (trimmed.startsWith('Entitlements')) continue;
    if (trimmed.startsWith('*') || trimmed.startsWith('†')) continue;

    // Check if it looks like a domain (contains a dot, no spaces in the domain part)
    const domainParts = trimmed.split(/\s+/);
    const potentialDomain = domainParts[0];

    if (potentialDomain.includes('.') && !potentialDomain.startsWith('-')) {
      const domain = {
        name: potentialDomain,
        type: domainParts[1] || null,
        status: domainParts[2] || null
      };
      result.domains.push(domain);
    }
  }

  return result;
}

/**
 * Parses the raw output of `aht @app.env domains:check`
 *
 * Example input:
 *   [prod] : 100.25.108.86 | 174.129.156.201 | carealliessitetechmprod.prod.acquia-sites.com
 *   brokers.careallies.com           174.129.156.201, 100.25.108.86   ok (A)
 *   brokers.careallies.com           174.129.156.201                 - pointed at ELB IP!
 *   brokersportal.careallies.com     brokersportal...cloudflare.net   Cloudflare CNAME integration
 */
function parseDomainsCheck(raw) {
  const result = {
    summary: null,
    checks: []
  };

  const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const lines = raw.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('WARNING')) continue;

    // Summary header line: [env] : ip1 | ip2 | hostname
    const headerMatch = line.match(/^\[([^\]]+)\]\s*:\s*(.+)$/);
    if (headerMatch && !result.summary) {
      const environment = headerMatch[1].trim();
      const segments = headerMatch[2].split('|').map(s => s.trim()).filter(Boolean);
      const ips = segments.filter(s => ipRegex.test(s));
      const hostname = segments.find(s => !ipRegex.test(s)) || null;
      result.summary = { environment, ips, hostname };
      continue;
    }

    // Data rows: columns are separated by runs of 2+ spaces.
    // Status text itself (e.g. "- pointed at ELB IP!") contains single
    // spaces, so a single-space split would incorrectly break it apart.
    const parts = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      result.checks.push({
        domain: parts[0],
        resolved: parts[1],
        status: parts.slice(2).join(' ')
      });
    } else if (parts.length === 2) {
      result.checks.push({
        domain: parts[0],
        resolved: parts[1],
        status: null
      });
    }
  }

  return result;
}

/**
 * Parses the raw output of `aht server <name>`
 *
 * Example input:
 *   name           : bal-47347
 *   realm          : Acquia Cloud Enterprise
 *   instance-id    : i-035b6dc2d1e72d0f9
 *   ...
 *   eip            : 54.210.238.149
 *   vpc-id         : 185
 *
 *   Server Config
 *   ================
 *     balancer:
 *       nginx_with_modsecurity_directives_enabled: false
 *       ...
 *
 * Only the top key/value summary block is parsed into structured fields
 * (especially "eip", which is the value support needs for DNS repointing).
 * The "Server Config" section below it is left as raw text since it's a
 * nested YAML-like structure that varies a lot between server types.
 */
function parseServerInfo(raw) {
  const result = {
    info: {},
    configRaw: null
  };

  const lines = raw.split('\n');

  let configStartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'Server Config') {
      configStartIndex = i;
      break;
    }
  }

  const infoLines = configStartIndex === -1 ? lines : lines.slice(0, configStartIndex);

  for (const rawLine of infoLines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('WARNING')) continue;
    if (line.startsWith('aht ')) continue; // skip an echoed command line, if present

    const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      result.info[key] = value;
    }
  }

  if (configStartIndex !== -1) {
    result.configRaw = lines.slice(configStartIndex).join('\n').trim();
  }

  return result;
}

/**
 * Parses the raw output of `dig <hostname>`
 *
 * Example input:
 *   ;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345
 *   ;; QUESTION SECTION:
 *   ;ntp.niehs.nih.gov.		IN	A
 *
 *   ;; ANSWER SECTION:
 *   ntp.niehs.nih.gov.	300	IN	A	1.2.3.4
 *
 *   ;; Query time: 7 msec
 *   ;; SERVER: 192.168.1.1#53(192.168.1.1)
 *   ;; WHEN: Thu Jun 18 15:40:10 IST 2026
 */
function parseDigOutput(raw) {
  const result = {
    status: null,
    question: null,
    answers: [],
    queryTime: null,
    server: null,
    when: null
  };

  const lines = raw.split('\n');

  const statusMatch = raw.match(/status:\s*(\w+)/);
  if (statusMatch) result.status = statusMatch[1];

  const questionIndex = lines.findIndex(l => l.includes('QUESTION SECTION'));
  if (questionIndex !== -1) {
    for (let i = questionIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) break;
      const parts = line.replace(/^;/, '').trim().split(/\s+/);
      if (parts.length >= 3) {
        result.question = {
          name: parts[0],
          recordClass: parts[1],
          type: parts[2]
        };
      }
      break;
    }
  }

  const answerIndex = lines.findIndex(l => l.includes('ANSWER SECTION'));
  if (answerIndex !== -1) {
    for (let i = answerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) break;
      const parts = line.split(/\s+/);
      if (parts.length >= 5) {
        result.answers.push({
          name: parts[0],
          ttl: parts[1],
          recordClass: parts[2],
          type: parts[3],
          value: parts.slice(4).join(' ')
        });
      }
    }
  }

  const queryTimeMatch = raw.match(/Query time:\s*(.+)/);
  if (queryTimeMatch) result.queryTime = queryTimeMatch[1].trim();

  const serverMatch = raw.match(/SERVER:\s*(.+)/);
  if (serverMatch) result.server = serverMatch[1].trim();

  const whenMatch = raw.match(/WHEN:\s*(.+)/);
  if (whenMatch) result.when = whenMatch[1].trim();

  return result;
}

module.exports = {
  parseApplicationInfo,
  parseDomainsList,
  parseDomainsCheck,
  parseServerInfo,
  parseDigOutput
};
