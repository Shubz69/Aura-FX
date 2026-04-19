/**
 * Live ADS-B positions via OpenSky Network (research / non-commercial use).
 * OpenSky requires OAuth2 client credentials (Bearer). Basic auth is no longer supported.
 * Set OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET from Account → API client (or legacy OPENSKY_USERNAME + OPENSKY_PASSWORD with the same values).
 * @see https://openskynetwork.github.io/opensky-api/rest.html
 */

const { fetchWithRetry } = require('../httpFetch');

const ID = 'opensky_live';
const HOSTS = ['opensky-network.org'];

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/** Regional boxes so we avoid downloading the entire globe in one payload. */
const BOXES = [
  { label: 'atlantic_na_eu', lamin: 25, lomin: -95, lamax: 58, lomax: 20 },
  { label: 'middle_east', lamin: 12, lomin: 25, lamax: 42, lomax: 63 },
  { label: 'west_pacific', lamin: -40, lomin: 110, lamax: 45, lomax: 180 },
];

/** In-memory token (serverless: one cold start per instance). */
let tokenCache = { token: null, expiresAt: 0 };
let tokenRefreshPromise = null;

function openskyDisabled() {
  const v = String(process.env.OPENSKY_ADAPTER_DISABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** OAuth client id + secret from OpenSky account page (API client). */
function clientCredentials() {
  const id = String(process.env.OPENSKY_CLIENT_ID || process.env.OPENSKY_USERNAME || '').trim();
  const secret = String(process.env.OPENSKY_CLIENT_SECRET || process.env.OPENSKY_PASSWORD || '').trim();
  return id && secret ? { id, secret } : null;
}

function hasOAuthCredentials() {
  return !!clientCredentials();
}

function invalidateOpenskyToken() {
  tokenCache = { token: null, expiresAt: 0 };
}

/**
 * @returns {Promise<string|null>} Bearer access token, or null if no credentials (anonymous API).
 */
async function getBearerToken() {
  const cred = clientCredentials();
  if (!cred) return null;

  const marginMs = (parseInt(process.env.OPENSKY_TOKEN_REFRESH_MARGIN_SEC || '30', 10) || 30) * 1000;
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + marginMs) {
    return tokenCache.token;
  }

  if (!tokenRefreshPromise) {
    tokenRefreshPromise = (async () => {
      try {
        const body = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: cred.id,
          client_secret: cred.secret,
        });
        const res = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`opensky_token_http_${res.status} ${text.slice(0, 200)}`);
        }
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('opensky_token_invalid_json');
        }
        const accessToken = data.access_token;
        const expiresIn = Number(data.expires_in) || 1800;
        if (!accessToken) throw new Error('opensky_token_missing_access_token');

        const safeExpiresSec = Math.max(60, expiresIn - 30);
        tokenCache = {
          token: accessToken,
          expiresAt: Date.now() + safeExpiresSec * 1000,
        };
        return accessToken;
      } finally {
        tokenRefreshPromise = null;
      }
    })();
  }

  return tokenRefreshPromise;
}

async function statesRequestHeaders() {
  const h = { Accept: 'application/json' };
  const token = await getBearerToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function boxLimit() {
  const n = parseInt(process.env.OPENSKY_MAX_BOXES || '', 10);
  if (Number.isFinite(n) && n >= 1) return Math.min(n, BOXES.length);
  const hasAuth = hasOAuthCredentials();
  if (hasAuth) return BOXES.length;
  // One geographic box on serverless by default — fewer timeouts and shorter cron wall time.
  if (process.env.VERCEL) return Math.min(1, BOXES.length);
  return Math.min(2, BOXES.length);
}

function fetchOpts() {
  const hasAuth = hasOAuthCredentials();
  const timeoutMs = Math.min(
    60000,
    Math.max(
      8000,
      parseInt(process.env.OPENSKY_FETCH_TIMEOUT_MS || (hasAuth ? '18000' : '12000'), 10) || (hasAuth ? 18000 : 12000)
    )
  );
  const maxAttempts = Math.max(
    1,
    Math.min(3, parseInt(process.env.OPENSKY_FETCH_ATTEMPTS || (hasAuth ? '2' : '1'), 10) || (hasAuth ? 2 : 1))
  );
  return { timeoutMs, maxAttempts };
}

function scoreRow(sv) {
  const baro = sv[7];
  const vel = sv[9];
  const altScore = baro != null ? Math.min(1, baro / 12000) : 0;
  const velScore = vel != null ? Math.min(1, vel / 280) : 0;
  return altScore * 0.55 + velScore * 0.45;
}

function parseStatesPayload(json) {
  const raw = json && json.states;
  if (!Array.isArray(raw)) return [];
  const rows = [];
  for (const sv of raw) {
    if (!Array.isArray(sv) || sv.length < 11) continue;
    const icao24 = sv[0];
    const callsign = sv[1] != null ? String(sv[1]).trim() : '';
    const originCountry = sv[2] != null ? String(sv[2]).trim() : '';
    const timePosition = sv[3];
    const longitude = sv[5];
    const latitude = sv[6];
    const baroAltitude = sv[7];
    const onGround = sv[8] === true;
    const velocity = sv[9];
    const trueTrack = sv[10];

    if (onGround) continue;
    if (longitude == null || latitude == null) continue;
    if (Math.abs(latitude) > 85) continue;

    rows.push({
      sv,
      icao24,
      callsign,
      originCountry,
      timePosition,
      longitude,
      latitude,
      baroAltitude,
      velocity,
      trueTrack,
      score: scoreRow(sv),
    });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

function eventFromRow(row) {
  const {
    icao24,
    callsign,
    originCountry,
    timePosition,
    longitude,
    latitude,
    baroAltitude,
    velocity,
    trueTrack,
  } = row;

  const icao = String(icao24 || '').toLowerCase();
  const url = `https://opensky-network.org/network/public?icao24=${encodeURIComponent(icao)}`;
  const title = `ADS-B · ${icao}`;
  const cs = callsign || '—';
  const altM = baroAltitude != null ? Math.round(baroAltitude) : '—';
  const spd = velocity != null ? velocity.toFixed(0) : '—';
  const hdg = trueTrack != null ? Math.round(trueTrack) : '—';
  const summary = `Live position · CS ${cs} · ${originCountry || 'unknown origin'} · FL ~${altM} m · ${spd} m/s · track ${hdg}°`;

  const tPos = timePosition != null ? new Date(timePosition * 1000) : new Date();
  const published_at = Number.isNaN(tPos.getTime())
    ? new Date().toISOString().slice(0, 19).replace('T', ' ')
    : tPos.toISOString().slice(0, 19).replace('T', ' ');

  return {
    source: ID,
    source_type: 'live_adsb',
    title: title.slice(0, 500),
    summary: summary.slice(0, 1200),
    body_snippet: summary.slice(0, 450),
    url,
    published_at,
    event_type: 'aviation',
    lat: Number(latitude),
    lng: Number(longitude),
    confidence: 0.82,
    verification_state: 'telemetry',
    tags: ['live_track', 'ads-b', 'opensky'],
    source_meta: {
      provider: 'opensky',
      icao24: icao,
      callsign: cs,
      origin_country: originCountry,
      baro_altitude_m: baroAltitude,
      velocity_m_s: velocity,
      true_track_deg: trueTrack,
      time_position: timePosition,
    },
  };
}

module.exports = {
  id: ID,
  tier: 'standard',
  defaultIntervalSeconds: 240,
  allowHosts: HOSTS,
  async run(ctx) {
    if (openskyDisabled()) {
      return {
        items: [],
        meta: {
          adapter_id: ID,
          skipped: true,
          reason: 'OPENSKY_ADAPTER_DISABLED',
        },
      };
    }

    const { timeoutMs, maxAttempts } = fetchOpts();
    const boxes = BOXES.slice(0, boxLimit());
    const maxPerBox = Math.min(28, Math.ceil((ctx.maxPerAdapter || 48) / Math.max(1, boxes.length)));
    const collected = [];

    for (const box of boxes) {
      if (ctx.shouldStop()) break;
      const q = new URLSearchParams({
        lamin: String(box.lamin),
        lomin: String(box.lomin),
        lamax: String(box.lamax),
        lomax: String(box.lomax),
      });
      const apiUrl = `https://opensky-network.org/api/states/all?${q.toString()}`;

      let parsedBox = [];
      for (let authRetry = 0; authRetry < 2; authRetry += 1) {
        try {
          const headers = await statesRequestHeaders();
          const { text } = await fetchWithRetry(apiUrl, {
            allowHosts: HOSTS,
            timeoutMs,
            headers,
            maxAttempts,
          });
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            break;
          }
          parsedBox = parseStatesPayload(json).slice(0, maxPerBox);
          break;
        } catch (e) {
          const msg = String(e && e.message);
          if (authRetry === 0 && msg === 'http_401' && hasOAuthCredentials()) {
            invalidateOpenskyToken();
            continue;
          }
          ctx.log('warn', `${ID} ${box.label}`, msg);
          break;
        }
      }
      collected.push(...parsedBox);
    }

    const merged = new Map();
    for (const row of collected) {
      const icaoKey = String(row.icao24 || '').toLowerCase();
      if (!icaoKey) continue;
      if (!merged.has(icaoKey) || merged.get(icaoKey).score < row.score) merged.set(icaoKey, row);
    }
    const unique = [...merged.values()].sort((a, b) => b.score - a.score);
    const cap = Math.min(ctx.maxPerAdapter || 48, 48, unique.length);
    const items = [];
    for (let i = 0; i < cap; i += 1) {
      items.push(eventFromRow(unique[i]));
    }

    return {
      items,
      meta: {
        adapter_id: ID,
        boxes: boxes.length,
        candidates: unique.length,
        emitted: items.length,
        opensky_timeout_ms: timeoutMs,
        opensky_attempts: maxAttempts,
        opensky_oauth: hasOAuthCredentials(),
      },
    };
  },
};
