/**
 * Live ADS-B positions via OpenSky Network (research / non-commercial use).
 *
 * Auth (first match wins for /api/states/all):
 *   1) HTTP Basic — OPENSKY_USERNAME + OPENSKY_PASSWORD (registered OpenSky account).
 *   2) OAuth2 client credentials — OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET (Bearer token).
 *   3) Anonymous — strict rate limits; on Vercel only one bbox per run.
 *
 * @see https://openskynetwork.github.io/opensky-api/rest.html
 */

const { fetchWithRetry } = require('../httpFetch');

const ID = 'opensky_live';
const HOSTS = ['opensky-network.org'];

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/**
 * Regional boxes so we avoid downloading the entire globe in one payload.
 * Middle East + Hormuz/Gulf of Oman mouth are one bbox (same HTTP payload as before split,
 * but one fewer `states/all` request vs separate ME + Hormuz boxes).
 */
const BOXES = [
  { label: 'atlantic_na_eu', lamin: 25, lomin: -95, lamax: 58, lomax: 20 },
  { label: 'middle_east_hormuz', lamin: 12, lomin: 25, lamax: 42, lomax: 65.5 },
  { label: 'west_pacific', lamin: -40, lomin: 110, lamax: 45, lomax: 180 },
  /** Latin America + Caribbean (no extra API vs one merged bbox per run). */
  { label: 'americas_latam', lamin: -54, lomin: -118, lamax: 32, lomax: -34 },
  /** Sub-Saharan Africa + western Indian Ocean lanes. */
  { label: 'africa_indian_ocean', lamin: -40, lomin: -25, lamax: 15, lomax: 130 },
];

/** In-memory token (serverless: one cold start per instance). */
let tokenCache = { token: null, expiresAt: 0 };
let tokenRefreshPromise = null;
/** After a token endpoint failure, skip OAuth until this time (ms) to avoid N sequential hangs per cron. */
let oauthSuspendedUntil = 0;

function oauthBackoffMs() {
  const onVercel = !!(process.env.VERCEL && String(process.env.VERCEL).toLowerCase() !== 'false');
  const defSec = onVercel ? 600 : 180;
  const s = parseInt(process.env.OPENSKY_OAUTH_BACKOFF_SEC || '', 10);
  const sec = Number.isFinite(s) && s >= 0 ? s : defSec;
  return sec * 1000;
}

function tokenFetchTimeoutMs() {
  const ms = parseInt(process.env.OPENSKY_TOKEN_FETCH_TIMEOUT_MS || '12000', 10);
  return Math.min(45000, Math.max(4000, Number.isFinite(ms) ? ms : 12000));
}

function openskyDisabled() {
  const v = String(process.env.OPENSKY_ADAPTER_DISABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Registered-account HTTP Basic (OpenSky REST historically used this for /api/states/all). */
function basicCredentials() {
  const user = String(process.env.OPENSKY_USERNAME || '').trim();
  const pass = String(process.env.OPENSKY_PASSWORD || '').trim();
  if (!user || !pass) return null;
  return { user, pass };
}

/** OAuth client id + secret only (do not mix with Basic username/password). */
function oauthClientCredentials() {
  const id = String(process.env.OPENSKY_CLIENT_ID || '').trim();
  const secret = String(process.env.OPENSKY_CLIENT_SECRET || '').trim();
  return id && secret ? { id, secret } : null;
}

function hasBasicCredentials() {
  return !!basicCredentials();
}

function hasOAuthCredentials() {
  return !!oauthClientCredentials();
}

/** Any credentialed mode (higher rate limits + more bboxes). */
function hasNetworkAuth() {
  return hasBasicCredentials() || hasOAuthCredentials();
}

function invalidateOpenskyToken() {
  tokenCache = { token: null, expiresAt: 0 };
}

/**
 * @returns {Promise<string|null>} Bearer access token, or null if no credentials (anonymous API).
 */
async function getBearerToken() {
  const cred = oauthClientCredentials();
  if (!cred) return null;

  const marginMs = (parseInt(process.env.OPENSKY_TOKEN_REFRESH_MARGIN_SEC || '30', 10) || 30) * 1000;
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + marginMs) {
    return tokenCache.token;
  }

  if (now < oauthSuspendedUntil) return null;

  if (!tokenRefreshPromise) {
    tokenRefreshPromise = (async () => {
      try {
        const body = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: cred.id,
          client_secret: cred.secret,
        });
        const tmo = tokenFetchTimeoutMs();
        let signal;
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          signal = AbortSignal.timeout(tmo);
        } else {
          const ac = new AbortController();
          setTimeout(() => ac.abort(), tmo);
          signal = ac.signal;
        }
        const res = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          signal,
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
        oauthSuspendedUntil = 0;
        return accessToken;
      } catch {
        oauthSuspendedUntil = Date.now() + oauthBackoffMs();
        invalidateOpenskyToken();
        return null;
      } finally {
        tokenRefreshPromise = null;
      }
    })();
  }

  return tokenRefreshPromise;
}

async function statesRequestHeaders() {
  const h = { Accept: 'application/json' };
  const basic = basicCredentials();
  if (basic) {
    const b64 = Buffer.from(`${basic.user}:${basic.pass}`, 'utf8').toString('base64');
    h.Authorization = `Basic ${b64}`;
    return h;
  }
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
  const credentialed = hasNetworkAuth();
  const timeoutMs = Math.min(
    60000,
    Math.max(
      8000,
      parseInt(process.env.OPENSKY_FETCH_TIMEOUT_MS || (credentialed ? '22000' : '12000'), 10) || (credentialed ? 22000 : 12000)
    )
  );
  const maxAttempts = Math.max(
    1,
    Math.min(3, parseInt(process.env.OPENSKY_FETCH_ATTEMPTS || (credentialed ? '2' : '1'), 10) || (credentialed ? 2 : 1))
  );
  return { timeoutMs, maxAttempts };
}

/**
 * ICAO ADS-B emitter category (index 17 when extended=1). OpenSky REST docs / Annex 10 Table A-2-68.
 * 4 = high vortex large, 5 = heavy, 6 = highly maneuverable, 7 = rotorcraft, 14 = UAV.
 */
function categoryBoost(category) {
  const c = Number(category);
  if (!Number.isFinite(c)) return 0;
  if (c === 14) return 0.11; // UAV
  if (c === 6) return 0.1; // high-performance (often fast mil / high-energy traffic)
  if (c === 5) return 0.09; // heavy — wide-body, many freighters, tankers, transports
  if (c === 4) return 0.055; // high vortex large
  if (c === 7) return 0.045; // rotorcraft
  if (c === 3) return 0.02; // large
  return 0;
}

const CARGO_CALLSIGN_RE =
  /^(UPS|FDX|DHL|ABX|GTI|CKS|ATN|POL|CLX|UAE|ETH|KAL|LAN|SLG|SWN|QTN|BCS|CAO|CJT|GEC)/;
const MIL_STYLE_CALLSIGN_RE =
  /^(RCH|REACH|CNV|NAVY|USAF|SAM|EXEC|EVAC|DUKE|TABOO|SHANK|SPAR|QUID|JAKE|VIPER|STEEL|RAF|RRR|ASY|GAF|NAF|IAF|PLF)/;

/** Extra ranking from callsign / squawk — no extra HTTP; biases cargo + mil-style traffic to the top of each box. */
function callsignAndSquawkBoost(callsign, squawkRaw) {
  const cs = String(callsign || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  let b = 0;
  const sq = String(squawkRaw || '').replace(/\s+/g, '');
  if (sq === '7500' || sq === '7600' || sq === '7700') b += 0.22;

  if (!cs || cs === '—') return b;

  if (CARGO_CALLSIGN_RE.test(cs)) b += 0.14;

  if (MIL_STYLE_CALLSIGN_RE.test(cs) || /^(RCH|REACH|CNV)/.test(cs.slice(0, 3))) b += 0.16;

  // All-numeric or tightly alphanumeric callsigns often correlate with mil coordination (weak signal).
  if (/^[0-9]{2,}[A-Z]?$/.test(cs) || /^[A-Z][0-9]{4,6}$/.test(cs)) b += 0.04;

  return Math.min(0.35, b);
}

function scoreRow(sv, category, callsign, squawk) {
  const baro = sv[7];
  const vel = sv[9];
  const altScore = baro != null ? Math.min(1, baro / 12000) : 0;
  const velScore = vel != null ? Math.min(1, vel / 280) : 0;
  let base = altScore * 0.52 + velScore * 0.38 + categoryBoost(category) + callsignAndSquawkBoost(callsign, squawk);
  const ec = Number(category);
  // Deprioritise light GA that is low + slow (same API payload; keeps corridor traffic visible).
  if (Number.isFinite(ec) && ec <= 2 && (baro == null || baro < 3200) && (vel == null || vel < 95)) {
    base *= 0.42;
  }
  return base;
}

const EMITTER_CATEGORY_LABEL = {
  0: 'class unknown',
  1: 'light',
  2: 'small',
  3: 'large',
  4: 'high-vortex large',
  5: 'heavy',
  6: 'high-performance',
  7: 'rotorcraft',
  14: 'UAV (emitter cat.)',
};

function emitterLabel(cat) {
  const n = Number(cat);
  if (!Number.isFinite(n)) return null;
  return EMITTER_CATEGORY_LABEL[n] || `cat ${n}`;
}

function aviationHintsFromRow({ callsign, emitterCategory, squawk, baroAltitude, velocity }) {
  const hints = [];
  const cs = String(callsign || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (MIL_STYLE_CALLSIGN_RE.test(cs) || /^(RCH|REACH|CNV)/.test(cs.slice(0, 3))) hints.push('military_air_candidate');
  if (CARGO_CALLSIGN_RE.test(cs)) hints.push('cargo_air_candidate');
  const ec = Number(emitterCategory);
  if (ec === 5 || ec === 4) hints.push('heavy_airframe');
  if (ec === 6 || ec === 14) hints.push('military_air_candidate');
  const sq = String(squawk || '').replace(/\s+/g, '');
  if (sq === '7500' || sq === '7600' || sq === '7700') hints.push('special_squawk');
  if ((baroAltitude == null || baroAltitude > 8000) && velocity != null && velocity > 200) hints.push('high_energy_track');
  if (/^[0-9]{2,}[A-Z]?$/.test(cs) || /^[A-Z][0-9]{4,6}$/.test(cs)) hints.push('coordination_style_callsign');
  return [...new Set(hints)];
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
    const verticalRate = sv.length > 11 && sv[11] != null ? Number(sv[11]) : null;
    const geoAltitude = sv.length > 13 && sv[13] != null ? Number(sv[13]) : null;
    const squawk = sv.length > 14 && sv[14] != null ? String(sv[14]).trim() : '';
    const positionSource = sv.length > 16 && sv[16] != null ? Number(sv[16]) : null;
    const emitterCategory = sv.length > 17 && sv[17] != null ? Number(sv[17]) : null;

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
      verticalRate,
      geoAltitude,
      squawk,
      positionSource,
      emitterCategory,
      score: scoreRow(sv, emitterCategory, callsign, squawk),
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
    verticalRate,
    geoAltitude,
    squawk,
    positionSource,
    emitterCategory,
  } = row;

  const icao = String(icao24 || '').toLowerCase();
  const url = `https://opensky-network.org/network/public?icao24=${encodeURIComponent(icao)}`;
  const csRaw = String(callsign || '').trim();
  const cs = csRaw || '—';
  const emitterCatLabel = emitterLabel(emitterCategory);
  const hints = aviationHintsFromRow({
    callsign: csRaw,
    emitterCategory,
    squawk,
    baroAltitude,
    velocity,
  });
  const roleBits = [];
  if (hints.includes('cargo_air_candidate')) roleBits.push('cargo');
  if (hints.includes('military_air_candidate')) roleBits.push('mil-style');
  const titleCore = cs !== '—' ? `${cs} · ${icao}` : icao;
  const title = `ADS-B · ${titleCore}${emitterCatLabel ? ` · ${emitterCatLabel}` : ''}${roleBits.length ? ` · ${roleBits.join('/')}` : ''}`.slice(
    0,
    500
  );
  const altM = baroAltitude != null ? Math.round(baroAltitude) : '—';
  const geoM = geoAltitude != null ? Math.round(geoAltitude) : '—';
  const spd = velocity != null ? velocity.toFixed(0) : '—';
  const hdg = trueTrack != null ? Math.round(trueTrack) : '—';
  const vs = verticalRate != null ? `${verticalRate > 0 ? '+' : ''}${verticalRate.toFixed(1)} m/s` : '—';
  const sq = squawk ? String(squawk) : '—';
  const posSrc = positionSource === 0 ? 'ADS-B' : positionSource === 1 ? 'ASTERIX' : positionSource != null ? `src ${positionSource}` : '—';
  const catLine =
    emitterCategory != null && Number.isFinite(Number(emitterCategory))
      ? `Emitter ${emitterCategory}${emitterCatLabel ? ` (${emitterCatLabel})` : ''}`
      : 'Emitter class unknown';
  const summary = `Live ADS-B · ${cs} · ${originCountry || 'unknown origin'} · baro ${altM} m · geo ${geoM} m · ${spd} m/s · track ${hdg}° · VS ${vs} · squawk ${sq} · ${posSrc} · ${catLine}`.slice(
    0,
    1200
  );

  const tPos = timePosition != null ? new Date(timePosition * 1000) : new Date();
  const published_at = Number.isNaN(tPos.getTime())
    ? new Date().toISOString().slice(0, 19).replace('T', ' ')
    : tPos.toISOString().slice(0, 19).replace('T', ' ');

  const tags = ['live_track', 'ads-b', 'opensky'];
  const ec = Number(emitterCategory);
  if (ec === 14) tags.push('uav_adsb_category');
  if (ec === 6) tags.push('high_performance_adsb');
  if (ec === 5) tags.push('heavy_adsb');
  if (ec === 4) tags.push('high_vortex_large');
  if (hints.includes('cargo_air_candidate')) tags.push('cargo_air_candidate');
  if (hints.includes('military_air_candidate')) tags.push('military_air_candidate');

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
    tags,
    source_meta: {
      provider: 'opensky',
      icao24: icao,
      callsign: cs,
      origin_country: originCountry,
      baro_altitude_m: baroAltitude,
      geo_altitude_m: geoAltitude,
      velocity_m_s: velocity,
      vertical_rate_m_s: verticalRate,
      true_track_deg: trueTrack,
      squawk: squawk || null,
      time_position: timePosition,
      position_source: positionSource,
      emitter_category: emitterCategory,
      emitter_category_label: emitterCatLabel,
      aviation_hints: hints,
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
    const adapterCap = Math.min(72, Math.max(1, ctx.maxPerAdapter || 60));
    const maxPerBox = Math.min(40, Math.ceil(adapterCap / Math.max(1, boxes.length)));
    const collected = [];

    for (const box of boxes) {
      if (ctx.shouldStop()) break;
      const q = new URLSearchParams({
        lamin: String(box.lamin),
        lomin: String(box.lomin),
        lamax: String(box.lamax),
        lomax: String(box.lomax),
        extended: '1',
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
          if (authRetry === 0 && msg === 'http_401' && hasOAuthCredentials() && !hasBasicCredentials()) {
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
    const cap = Math.min(adapterCap, 72, unique.length);
    const items = [];
    for (let i = 0; i < cap; i += 1) {
      items.push(eventFromRow(unique[i]));
    }

    const fetchedCount = collected.length;
    const normalizedEmitted = items.length;
    ctx.log('info', `${ID} ingest_summary`, {
      fetched_count: fetchedCount,
      normalized_emitted: normalizedEmitted,
      unique_aircraft: unique.length,
      boxes: boxes.length,
      auth_mode: hasBasicCredentials() ? 'basic' : hasOAuthCredentials() ? 'oauth' : 'anonymous',
    });

    return {
      items,
      meta: {
        adapter_id: ID,
        boxes: boxes.length,
        candidates: unique.length,
        emitted: items.length,
        fetched_count: fetchedCount,
        normalized_emitted: normalizedEmitted,
        opensky_timeout_ms: timeoutMs,
        opensky_attempts: maxAttempts,
        opensky_basic: hasBasicCredentials(),
        opensky_oauth: hasOAuthCredentials(),
        opensky_oauth_suspended_until: oauthSuspendedUntil > Date.now() ? oauthSuspendedUntil : null,
        opensky_token_fetch_timeout_ms: tokenFetchTimeoutMs(),
      },
    };
  },
};
