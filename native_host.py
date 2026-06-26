#!/usr/bin/env python3
import sys
import json
import struct
import subprocess
import re
import os

# Ensure aht is findable regardless of how Chrome launched this script
_home = os.path.expanduser('~')
os.environ['PATH'] = (
    f'{_home}/Support-Tools/bin:'
    '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:'
    + os.environ.get('PATH', '')
)

# ── Native messaging protocol ─────────────────────────────────────────────────

def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    length = struct.unpack('<I', raw)[0]
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode('utf-8'))

def send_message(msg):
    encoded = json.dumps(msg).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

# ── Helpers ───────────────────────────────────────────────────────────────────

ANSI_ESCAPE_RE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
BARE_ANSI_RE   = re.compile(r'\[[0-9]{1,3}(?:;[0-9]{1,3})*m')

def strip_ansi(text):
    if not text:
        return text
    text = ANSI_ESCAPE_RE.sub('', text)
    text = BARE_ANSI_RE.sub('', text)
    return text

def run_cmd(cmd):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, shell=False, timeout=60)
        output = result.stdout if result.stdout.strip() else result.stderr
        return strip_ansi(output)
    except subprocess.TimeoutExpired:
        return "Error: aht command timed out after 60 seconds. Check your VPN connection."
    except Exception as e:
        return f"Error: {str(e)}"

# ── Parsers (identical logic to backend.py) ───────────────────────────────────

def parse_balancers_from_app_info(output):
    envs = {}
    current_env = None
    # Flexible: match [envname: anything] or [envname:anything]
    header_re = re.compile(r'^\[([\w\-]+)\s*:[^\]]*\]')
    for line in output.split('\n'):
        s = line.strip()
        m = header_re.match(s)
        if m:
            current_env = m.group(1).lower()
            envs[current_env] = {'balancers': [], 'type': 'unknown'}
            continue
        if not current_env:
            continue
        bal_match = re.search(r'((?:bal|svn)-[A-Z0-9]+)', line, re.IGNORECASE)
        if bal_match:
            bid = bal_match.group(1)
            if bid not in envs[current_env]['balancers']:
                envs[current_env]['balancers'].append(bid)
        ll = line.lower()
        if 'dedicated' in ll:
            envs[current_env]['type'] = 'dedicated'
        elif 'shared' in ll and envs[current_env]['type'] == 'unknown':
            envs[current_env]['type'] = 'shared'
    return envs

def parse_server_output(output):
    eip = None
    is_primary = True
    for line in output.split('\n'):
        ll = line.lower()
        if any(k in ll for k in ('failover', 'backup', 'secondary')):
            is_primary = False
        if 'eip' in ll and '<none>' not in ll:
            m = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', line)
            if m:
                eip = m.group(1)
    return {'eip': eip, 'is_primary': is_primary, 'raw': output}

def parse_dc_output(output):
    domains = []
    current_env = None
    expected_ip = None
    header_re = re.compile(r'^\[([\w\-]+)\]\s*:\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', re.IGNORECASE)
    for line in output.split('\n'):
        s = line.strip()
        m = header_re.match(s)
        if m:
            current_env = m.group(1).lower()
            expected_ip = m.group(2)
            continue
        if not current_env or not s or s.startswith('>'):
            continue
        dm = re.match(r'^([\w\-]+(?:\.[\w\-]+)+)', s)
        if not dm:
            continue
        domain_name = dm.group(1)
        rest = s[len(domain_name):]
        ips = re.findall(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', rest)
        actual_ip = ips[-1] if ips else None
        rl = rest.lower()
        status, status_detail = 'unknown', ''
        if 'ok (a)' in rl:           status, status_detail = 'ok_a',          'OK - A record pointing correctly'
        elif 'ok (cname)' in rl:     status, status_detail = 'ok_cname',       'OK - CNAME pointing correctly'
        elif 'cloudflare authoritative' in rl or 'cloudflare nameservers' in rl:
                                      status, status_detail = 'cloudflare_ns',  'Cloudflare authoritative DNS'
        elif 'cloudflare' in rl:     status, status_detail = 'cloudflare',     'Cloudflare CDN detected'
        elif 'akamai' in rl:         status, status_detail = 'akamai',         'Akamai CDN detected'
        elif 'not pointing at acquia' in rl: status, status_detail = 'not_pointing', 'Not pointing at Acquia'
        elif 'missing edge cluster' in rl:   status, status_detail = 'missing_edge',  'Missing Edge Cluster A record'
        elif 'bypassing edge cluster' in rl: status, status_detail = 'bypassing',     'Bypassing Edge Cluster'
        elif 'no dns entry' in rl:   status, status_detail = 'no_dns',         'No DNS entry found'
        matches = (actual_ip == expected_ip) if actual_ip and expected_ip else False
        domains.append({
            'env': current_env, 'domain': domain_name,
            'expected_ip': expected_ip, 'actual_ip': actual_ip,
            'status': status, 'status_detail': status_detail,
            'matches': matches, 'raw_line': s
        })
    return domains

def parse_domain_list_output(output):
    domains = []
    for line in output.split('\n'):
        s = line.strip()
        if not s or '.' not in s:
            continue
        if s.startswith('***') or s.startswith('['):
            continue
        m = re.match(r'^([\w\-]+(?:\.[\w\-]+)+)', s)
        if m:
            domains.append({'domain': m.group(1), 'raw_line': s})
    return domains

def detect_invalid_docroot(output, envs):
    if not output or not output.strip():
        return True, "No output returned — the application name may not exist."
    # Subprocess errors (timeout, path issues) are prefixed with "Error:"
    if output.startswith("Error:"):
        return True, output
    ol = output.lower()
    for pattern, msg in [
        ("could not find application", "Application not found in AHT. Check the docroot name."),
        ("application not found",      "Application not found in AHT. Check the docroot name."),
        ("no such application",        "Application does not exist."),
        ("unknown application",        "Unknown application name."),
        ("does not exist",             "Application does not exist."),
        ("no docroot",                 "Docroot not found."),
        ("invalid docroot",            "Invalid docroot name."),
        ("timed out",                  "aht timed out — check your VPN connection and try again."),
        ("error: unknown",             "AHT returned an unknown error."),
    ]:
        if pattern in ol:
            return True, msg
    if not envs:
        return True, "No environments found. Verify the docroot name exists in CCI."
    return False, ""

# ── Command handlers ──────────────────────────────────────────────────────────

def handle_full_check(username):
    app_info_output = run_cmd(["aht", f"@{username}", "application:info"])
    envs = parse_balancers_from_app_info(app_info_output)
    is_invalid, invalid_reason = detect_invalid_docroot(app_info_output, envs)
    if is_invalid:
        return {
            "success": False, "error_type": "invalid_docroot",
            "error": invalid_reason, "customer": username,
            "raw_outputs": {"app_info": app_info_output},
            "debug_envs_parsed": envs,
        }

    env_eips = {}
    balancer_details = {}
    for env_name, env_data in envs.items():
        if env_data['balancers']:
            primary_bal = env_data['balancers'][0]
            server_output = run_cmd(["aht", "server", primary_bal])
            server_info = parse_server_output(server_output)
            env_eips[env_name] = server_info['eip']
            balancer_details[env_name] = {
                'balancers': env_data['balancers'], 'type': env_data['type'],
                'primary_balancer': primary_bal, 'eip': server_info['eip'],
                'server_output': server_output
            }

    dc_output = run_cmd(["aht", f"@{username}", "dc"])
    domains = parse_dc_output(dc_output)

    # Only count environments that app:info knows about — filters out [vcs], [svn], etc.
    known_envs = set(envs.keys())
    prod    = [d for d in domains if d['env'] == 'prod']
    nonprod = [d for d in domains if d['env'] != 'prod' and d['env'] in known_envs]

    # CDN domains (cloudflare/akamai) can't be IP-matched but aren't a repointing failure
    OK_STATUSES = {'ok_a', 'ok_cname', 'cloudflare', 'cloudflare_ns', 'akamai'}
    prod_ok  = all(d['matches'] or d['status'] in OK_STATUSES for d in prod)    if prod    else True
    nprod_ok = all(d['matches'] or d['status'] in OK_STATUSES for d in nonprod) if nonprod else True

    issues, warnings = [], []
    if not prod_ok  and prod:    issues.append("Production domains have NOT been repointed")
    if not nprod_ok and nonprod: issues.append("Non-production domains have NOT been repointed")

    cdn_domains     = [d for d in domains if d['status'] == 'cloudflare']
    missing_edge    = [d for d in domains if d['status'] == 'missing_edge']
    if cdn_domains:  warnings.append(f"{len(cdn_domains)} domain(s) using Cloudflare CDN - manual verification required")
    if missing_edge: issues.append(f"{len(missing_edge)} domain(s) missing Edge Cluster A record")

    prod_eip  = env_eips.get('prod')
    nprod_eip = env_eips.get('dev') or env_eips.get('test') or env_eips.get('stage')
    if prod_eip and nprod_eip and prod_eip != nprod_eip:
        warnings.append(f"Different EIPs: Prod ({prod_eip}) vs Non-Prod ({nprod_eip})")

    domain_list_output = run_cmd(["aht", f"@{username}", "domains:list"])
    domain_list = parse_domain_list_output(domain_list_output)

    return {
        'success': True, 'customer': username,
        'environments': balancer_details, 'eips': env_eips,
        'domains': domains, 'domain_list': domain_list,
        'summary': {
            'all_repointed': prod_ok and nprod_ok,
            'prod_repointed': prod_ok, 'non_prod_repointed': nprod_ok,
            'total_domains': len(prod) + len(nonprod),
            'prod_domains_count': len(prod), 'non_prod_domains_count': len(nonprod),
            'issues': issues, 'warnings': warnings,
            'cdn_detected': len(cdn_domains) > 0,
            'has_dedicated_balancers': any(e['type'] == 'dedicated' for e in envs.values()),
            'has_shared_balancers':    any(e['type'] == 'shared'    for e in envs.values()),
        },
        'raw_outputs': {
            'app_info': app_info_output, 'dc': dc_output,
            'domain_list': domain_list_output,
        }
    }

def handle_whois(ip):
    output = run_cmd(["whois", ip])
    ol = output.lower()
    vendor = None
    for name, keywords in [
        ('Cloudflare',    ['cloudflare']),
        ('Akamai',        ['akamai']),
        ('Fastly',        ['fastly']),
        ('Amazon/AWS',    ['amazon', 'aws']),
        ('Google Cloud',  ['google']),
        ('Microsoft Azure',['microsoft', 'azure']),
        ('Acquia',        ['acquia']),
    ]:
        if any(k in ol for k in keywords):
            vendor = name
            break
    return {'ip': ip, 'vendor': vendor, 'output': output}

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    try:
        msg = read_message()
        if not msg:
            send_message({'success': False, 'error': 'No message received'})
            return

        cmd = msg.get('command')

        if cmd == 'full_check':
            send_message(handle_full_check(msg.get('username', '')))
        elif cmd == 'domain_list':
            username = msg.get('username', '')
            output = run_cmd(["aht", f"@{username}", "domains:list"])
            domains = parse_domain_list_output(output)
            send_message({'success': True, 'customer': username, 'domains': domains,
                          'total_domains': len(domains), 'raw_output': output})
        elif cmd == 'whois':
            send_message(handle_whois(msg.get('ip', '')))
        else:
            send_message({'success': False, 'error': f'Unknown command: {cmd}'})
    except Exception as e:
        send_message({'success': False, 'error': str(e)})

if __name__ == '__main__':
    main()
