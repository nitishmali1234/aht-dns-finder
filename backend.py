from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Matches real ANSI/VT100 escape sequences, e.g. \x1b[33m, \x1b[1;32m, \x1b[0m
ANSI_ESCAPE_RE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
# Matches "bare" sequences where the leading ESC byte was already lost/stripped
# upstream, leaving literal text like "[33m" or "[32;1m" in the output.
BARE_ANSI_RE = re.compile(r'\[[0-9]{1,3}(?:;[0-9]{1,3})*m')

def strip_ansi_codes(text):
    """Remove ANSI color/formatting escape codes from CLI output."""
    if not text:
        return text
    text = ANSI_ESCAPE_RE.sub('', text)
    text = BARE_ANSI_RE.sub('', text)
    return text

def run_cmd(cmd):
    """Execute shell command and return output, with ANSI codes stripped"""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, shell=False, timeout=30)
        output = result.stdout or result.stderr
        return strip_ansi_codes(output)
    except Exception as e:
        return f"Error: {str(e)}"

def parse_balancers_from_app_info(output):
    """
    Parse 'aht @app a:i' output to extract balancers per environment.
    Handles both a single-environment header block (when an env suffix
    like @app.prod is given) and multiple stacked header blocks (when
    no env suffix is given, e.g. @app, which returns every environment
    in one call).

    Each environment block starts with a header line of the form:
        [envname: appname] [Display Name: ...] ...
    envname is read directly from the header rather than guessed from
    keywords, so custom env names like 'dev2' or 'test' are captured
    correctly.

    Returns: {
        'prod': {'balancers': ['bal-XXXXX', ...], 'type': 'dedicated/shared'},
        'dev2': {...}, 'test': {...}, ...
    }
    """
    envs = {}
    current_env = None
    lines = output.split('\n')

    header_re = re.compile(r'^\[([\w\-]+):\s*[\w\-\.]+\]')

    for line in lines:
        line_stripped = line.strip()

        header_match = header_re.match(line_stripped)
        if header_match:
            current_env = header_match.group(1).lower()
            envs[current_env] = {'balancers': [], 'type': 'unknown'}
            continue

        if not current_env:
            continue

        line_lower = line.lower()

        # Extract balancer/server IDs (bal-XXXXX or svn-XXXXX)
        bal_match = re.search(r'((?:bal|svn)-[A-Z0-9]+)', line, re.IGNORECASE)
        if bal_match:
            bal_id = bal_match.group(1)
            if bal_id not in envs[current_env]['balancers']:
                envs[current_env]['balancers'].append(bal_id)

        # Detect dedicated vs shared (prefer 'dedicated' if any row has it)
        if 'dedicated' in line_lower:
            envs[current_env]['type'] = 'dedicated'
        elif 'shared' in line_lower and envs[current_env]['type'] == 'unknown':
            envs[current_env]['type'] = 'shared'

    return envs

def parse_server_output(output):
    """
    Parse 'aht server bal-XXXXX' output to extract EIP
    Returns: {'eip': '1.2.3.4', 'is_primary': True/False, 'raw': output}
    """
    eip = None
    is_primary = True
    
    for line in output.split('\n'):
        line_lower = line.lower()
        
        # Check if this is a failover/backup balancer
        if 'failover' in line_lower or 'backup' in line_lower or 'secondary' in line_lower:
            is_primary = False
        
        # Extract EIP
        if 'eip' in line_lower and '<none>' not in line_lower:
            ip_match = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', line)
            if ip_match:
                eip = ip_match.group(1)
    
    return {
        'eip': eip,
        'is_primary': is_primary,
        'raw': output
    }

def parse_dc_output(output):
    """
    Parse 'aht dc' output to extract domain DNS status.
    Handles both a single environment block (env suffix given, e.g.
    @app.prod) and multiple stacked environment blocks (no suffix
    given, e.g. @app, which returns every environment in one call).

    Each environment block starts with a header line:
        [envname] : expected_ip
    followed by one or more domain rows. Domain rows start with a
    bare hostname (no brackets) followed by CNAME/IP/status info.
    Lines starting with '>' are CNAME continuation lines and are
    skipped (they describe the row above, not a new domain).

    Returns list of domains with their status
    """
    domains = []
    current_env = None
    expected_ip = None

    header_re = re.compile(r'^\[([\w\-]+)\]\s*:\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', re.IGNORECASE)

    lines = output.split('\n')

    for line in lines:
        line_stripped = line.strip()

        # Parse environment header: [prod] : 52.51.115.190
        header_match = header_re.match(line_stripped)
        if header_match:
            current_env = header_match.group(1).lower()
            expected_ip = header_match.group(2)
            continue

        if not current_env or not line_stripped:
            continue

        # CNAME continuation lines (e.g. "> e83061.b.akamaiedge.net")
        # belong to the domain row above them, not a new domain.
        if line_stripped.startswith('>'):
            continue

        # A domain row starts with a bare hostname (has at least one dot)
        domain_match = re.match(r'^([\w\-]+(?:\.[\w\-]+)+)', line_stripped)
        if not domain_match:
            continue

        domain_name = domain_match.group(1)
        rest_of_line = line_stripped[len(domain_name):]

        # Extract IP(s) appearing after the domain name on this line
        ips = re.findall(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', rest_of_line)
        actual_ip = ips[-1] if ips else None

        rest_lower = rest_of_line.lower()

        # Determine status
        status = 'unknown'
        status_detail = ''

        if 'ok (a)' in rest_lower:
            status = 'ok_a'
            status_detail = 'OK - A record pointing correctly'
        elif 'ok (cname)' in rest_lower:
            status = 'ok_cname'
            status_detail = 'OK - CNAME pointing correctly'
        elif 'cloudflare authoritative' in rest_lower or 'cloudflare nameservers' in rest_lower:
            status = 'cloudflare_ns'
            status_detail = 'Cloudflare authoritative DNS - using Cloudflare nameservers'
        elif 'cloudflare' in rest_lower:
            status = 'cloudflare'
            status_detail = 'Cloudflare CDN detected - manual verification needed'
        elif 'akamai' in rest_lower:
            status = 'akamai'
            status_detail = 'Akamai CDN detected - manual verification needed'
        elif 'not pointing at acquia' in rest_lower:
            status = 'not_pointing'
            status_detail = 'Not pointing at Acquia'
        elif 'missing edge cluster' in rest_lower:
            status = 'missing_edge'
            status_detail = 'Missing Edge Cluster A record'
        elif 'bypassing edge cluster' in rest_lower:
            status = 'bypassing'
            status_detail = 'Bypassing Edge Cluster'
        elif 'no dns entry' in rest_lower:
            status = 'no_dns'
            status_detail = 'No DNS entry found'

        # Check if IP matches expected
        matches = (actual_ip == expected_ip) if actual_ip and expected_ip else False

        domains.append({
            'env': current_env,
            'domain': domain_name,
            'expected_ip': expected_ip,
            'actual_ip': actual_ip,
            'status': status,
            'status_detail': status_detail,
            'matches': matches,
            'raw_line': line_stripped
        })

    return domains

def detect_invalid_docroot(output: str, envs: dict):
    """
    Returns (is_invalid: bool, reason: str).
    Checks output and parsed envs to determine if the docroot is invalid.
    """
    if not output or not output.strip():
        return True, "No output returned — the application name may not exist."

    output_lower = output.lower()
    error_patterns = [
        ("could not find application", "Application not found in AHT"),
        ("application not found",      "Application not found in AHT"),
        ("no such application",        "Application does not exist"),
        ("unknown application",        "Unknown application name"),
        ("does not exist",             "Application does not exist"),
        ("no docroot",                 "Docroot not found"),
        ("invalid docroot",            "Invalid docroot name"),
        ("error: unknown",             "AHT returned an unknown error"),
    ]
    for pattern, msg in error_patterns:
        if pattern in output_lower:
            return True, msg

    if not envs:
        return True, (
            "No environments found for this application. "
            "Verify the docroot name exists in CCI."
        )

    return False, ""


def parse_domain_list_output(output):
    """
    Parse 'aht do:li' output to extract the list of domain aliases
    attached to an environment.
    Returns: [{'domain': '...', 'raw_line': '...'}, ...]
    """
    domains = []
    for line in output.split('\n'):
        line_stripped = line.strip()
        if not line_stripped:
            continue

        # Skip header/warning/banner lines (no dot, or contains brackets like [dev])
        if '.' not in line_stripped:
            continue
        if line_stripped.startswith('***') or line_stripped.startswith('['):
            continue

        # A domain line generally looks like a bare hostname, optionally
        # followed by extra info (separated by whitespace).
        domain_match = re.match(r'^([\w\-]+(?:\.[\w\-]+)+)', line_stripped)
        if domain_match:
            domains.append({
                'domain': domain_match.group(1),
                'raw_line': line_stripped
            })

    return domains


@app.get("/domain-list")
def domain_list(username: str):
    """
    Run 'aht @customer do:li' and return the parsed list of domain
    aliases for the environment, alongside the raw output.
    """
    output = run_cmd(["aht", f"@{username}", "do:li"])
    domains = parse_domain_list_output(output)

    return {
        'success': True,
        'customer': username,
        'domains': domains,
        'total_domains': len(domains),
        'raw_output': output
    }


@app.get("/full-check")
def full_dns_check(username: str):
    """
    Complete DNS repointing check workflow:
    1. Run 'aht @customer a:i' to get balancer info
    2. Run 'aht server bal-XXXXX' for each primary balancer to get EIPs
    3. Run 'aht @customer dc' to check domain DNS
    4. Compare and analyze results
    """
    
    # Step 1: Get application info
    app_info_output = run_cmd(["aht", f"@{username}", "a:i"])

    # Step 2: Parse balancers — detect invalid docroot early
    envs = parse_balancers_from_app_info(app_info_output)
    is_invalid, invalid_reason = detect_invalid_docroot(app_info_output, envs)
    if is_invalid:
        return {
            "success": False,
            "error_type": "invalid_docroot",
            "error": invalid_reason,
            "customer": username,
            "raw_outputs": {"app_info": app_info_output},
        }
    
    # Step 3: Get EIP for each environment's primary balancer
    env_eips = {}
    balancer_details = {}
    
    for env_name, env_data in envs.items():
        if env_data['balancers']:
            # Get first (primary) balancer
            primary_bal = env_data['balancers'][0]
            server_output = run_cmd(["aht", "server", primary_bal])
            server_info = parse_server_output(server_output)
            
            env_eips[env_name] = server_info['eip']
            balancer_details[env_name] = {
                'balancers': env_data['balancers'],
                'type': env_data['type'],
                'primary_balancer': primary_bal,
                'eip': server_info['eip'],
                'server_output': server_output
            }
    
    # Step 4: Run domain check
    dc_output = run_cmd(["aht", f"@{username}", "dc"])
    
    # Step 5: Parse domain check results
    domains = parse_dc_output(dc_output)
    
    # Step 6: Analyze results
    prod_domains = [d for d in domains if d['env'] == 'prod']
    non_prod_domains = [d for d in domains if d['env'] != 'prod']
    
    prod_repointed = all(d['matches'] or d['status'] in ['ok_a', 'ok_cname'] for d in prod_domains) if prod_domains else True
    non_prod_repointed = all(d['matches'] or d['status'] in ['ok_a', 'ok_cname'] for d in non_prod_domains) if non_prod_domains else True
    all_repointed = prod_repointed and non_prod_repointed
    
    # Detect issues
    issues = []
    warnings = []
    
    if not prod_repointed and prod_domains:
        issues.append("❌ Production domains have NOT been repointed to dedicated balancers")
    
    if not non_prod_repointed and non_prod_domains:
        issues.append("❌ Non-production domains have NOT been repointed to dedicated balancers")
    
    # Check for CDN
    cdn_domains = [d for d in domains if d['status'] == 'cloudflare']
    if cdn_domains:
        warnings.append(f"⚠️ {len(cdn_domains)} domain(s) using Cloudflare CDN - manual verification required")
    
    # Check for missing edge cluster
    missing_edge = [d for d in domains if d['status'] == 'missing_edge']
    if missing_edge:
        issues.append(f"⚠️ {len(missing_edge)} domain(s) missing Edge Cluster A record")
    
    # Check if EIPs are different for prod vs non-prod
    prod_eip = env_eips.get('prod')
    non_prod_eip = env_eips.get('dev') or env_eips.get('test') or env_eips.get('stage')
    
    if prod_eip and non_prod_eip and prod_eip != non_prod_eip:
        warnings.append(f"⚠️ Different EIPs detected: Prod ({prod_eip}) vs Non-Prod ({non_prod_eip})")
    
    # Step 7: Generate summary
    summary = {
        'all_repointed': all_repointed,
        'prod_repointed': prod_repointed,
        'non_prod_repointed': non_prod_repointed,
        'total_domains': len(domains),
        'prod_domains_count': len(prod_domains),
        'non_prod_domains_count': len(non_prod_domains),
        'issues': issues,
        'warnings': warnings,
        'cdn_detected': len(cdn_domains) > 0,
        'has_dedicated_balancers': any(e['type'] == 'dedicated' for e in envs.values()),
        'has_shared_balancers': any(e['type'] == 'shared' for e in envs.values())
    }
    
    # Step 7: Domain list (do:li) — folded in so the UI needs only one request
    domain_list_output = run_cmd(["aht", f"@{username}", "do:li"])
    domain_list = parse_domain_list_output(domain_list_output)

    return {
        'success': True,
        'customer': username,
        'environments': balancer_details,
        'eips': env_eips,
        'domains': domains,
        'domain_list': domain_list,
        'summary': summary,
        'raw_outputs': {
            'app_info': app_info_output,
            'dc': dc_output,
            'domain_list': domain_list_output,
        }
    }

@app.get("/whois")
def whois_lookup(ip: str):
    """Run whois lookup on an IP address"""
    output = run_cmd(["whois", ip])
    
    # Detect vendor
    vendor = None
    output_lower = output.lower()
    
    vendors = {
        'Cloudflare': ['cloudflare'],
        'Akamai': ['akamai'],
        'Fastly': ['fastly'],
        'Amazon/AWS': ['amazon', 'aws', 'amazon.com'],
        'Google Cloud': ['google', 'goog'],
        'Microsoft Azure': ['microsoft', 'azure'],
        'Acquia': ['acquia']
    }
    
    for vendor_name, keywords in vendors.items():
        if any(keyword in output_lower for keyword in keywords):
            vendor = vendor_name
            break
    
    return {
        'ip': ip,
        'vendor': vendor,
        'output': output
    }

@app.get("/varnish-check")
def varnish_traffic_check(app_env: str, bal_server: str, domain: str):
    """
    Check if domain still has traffic on old balancer
    Used when 'Missing Edge Cluster' is detected
    """
    # Command: aht @app.env ssh bal-XXXXX "grep domain /var/log/varnish/varnishncsa.log | tail -20"
    cmd = [
        "aht", f"@{app_env}", "ssh", bal_server,
        f"grep {domain} /var/log/varnish/varnishncsa.log | tail -20"
    ]
    
    output = run_cmd(cmd)
    
    has_traffic = bool(output.strip() and 'no output' not in output.lower())
    
    return {
        'app_env': app_env,
        'balancer': bal_server,
        'domain': domain,
        'has_traffic': has_traffic,
        'output': output,
        'recommendation': (
            "⚠️ Domain still has traffic - customer needs to repoint DNS" 
            if has_traffic 
            else "✅ No traffic detected - domain has moved off this balancer"
        )
    }