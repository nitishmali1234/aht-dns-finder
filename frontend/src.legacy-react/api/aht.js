/**
 * Queries the backend AHT bridge.
 *
 * Uses an absolute URL rather than a relative path because this code
 * runs both as a normal CRA dev-server page (which proxies "/api/aht"
 * to localhost:4000 automatically) and as a packaged Chrome extension
 * page (which has no dev-server proxy at all, so it must address the
 * backend directly). Override via the REACT_APP_API_BASE_URL env var
 * at build time if the backend runs somewhere other than localhost:4000.
 *
 * @param {string} appName - Application / docroot name (e.g. "tufts.01live")
 * @param {string|null} env - Environment identifier (e.g. "01live"), nullable
 * @param {string} command - AHT command to run (e.g. "application:info", "domains:list")
 * @returns {Promise<Object>} Parsed JSON response: { raw, parsed, warnings, command, timestamp, error? }
 */
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

export async function queryAht(appName, env, command, serverName, hostname) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/aht`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: appName, env, command, serverName, hostname }),
    });
  } catch (networkError) {
    throw new Error(
      `Network error: unable to reach the backend at ${API_BASE_URL}. Is the server running? (${networkError.message})`
    );
  }

  // Attempt to parse JSON regardless of status code — the backend may
  // return structured error payloads with non-2xx codes.
  let data;
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Unexpected response from server (status ${response.status}): ${text.slice(0, 200) || 'non-JSON body'}`
    );
  }

  try {
    data = await response.json();
  } catch (parseError) {
    throw new Error(
      `Failed to parse server response as JSON (status ${response.status}): ${parseError.message}`
    );
  }

  // If HTTP status is not OK and the body doesn't already carry an error field, inject one.
  if (!response.ok && !data.error) {
    data.error = data.message || `Server returned status ${response.status}`;
  }

  return data;
}
