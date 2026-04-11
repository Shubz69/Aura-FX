const COUNTRY_HINTS = [
  ['united states', 'US', 39.8283, -98.5795],
  ['u.s.', 'US', 39.8283, -98.5795],
  ['usa', 'US', 39.8283, -98.5795],
  ['china', 'CN', 35.8617, 104.1954],
  ['russia', 'RU', 61.524, 105.3188],
  ['ukraine', 'UA', 48.3794, 31.1656],
  ['european union', 'EU', 50.1109, 8.6821],
  ['euro area', 'EU', 50.1109, 8.6821],
  ['germany', 'DE', 51.1657, 10.4515],
  ['france', 'FR', 46.2276, 2.2137],
  ['united kingdom', 'GB', 55.3781, -3.436],
  ['japan', 'JP', 36.2048, 138.2529],
  ['iran', 'IR', 32.4279, 53.688],
  ['israel', 'IL', 31.0461, 34.8516],
  ['india', 'IN', 20.5937, 78.9629],
  ['brazil', 'BR', -14.235, -51.9253],
  ['canada', 'CA', 56.1304, -106.3468],
  ['mexico', 'MX', 23.6345, -102.5528],
  ['saudi', 'SA', 23.8859, 45.0792],
  ['venezuela', 'VE', 6.4238, -66.5897],
];

function classifyEventType(text) {
  const t = text.toLowerCase();
  if (/\b(sanction|ofac|asset freeze|blocked person)\b/.test(t)) return 'sanctions';
  if (
    /\b(container|supply chain|port congestion|chokepoint|freight index|logistics backlog|freight disruption|freight rates)\b/.test(
      t
    )
  )
    return 'logistics';
  if (/\b(canal)\b/.test(t) && /\b(congestion|container|freight|transit|queue|delay|backlog)\b/.test(t))
    return 'logistics';
  if (/\b(maritime|shipping|port|vessel|navy|strait)\b/.test(t)) return 'maritime';
  if (/\b(airspace|flight|aviation|airport|faa|notam|diversion|ground stop|airspace closure)\b/.test(t))
    return 'aviation';
  if (/\b(conflict|military|strike|missile|war|ceasefire|troops)\b/.test(t)) return 'conflict';
  if (/\b(oil|opec|crude|gas|lng|energy)\b/.test(t)) return 'energy';
  if (/\b(wheat|corn|soy|commodit|copper|gold)\b/.test(t)) return 'commodities';
  if (/\b(fed|ecb|boj|boe|central bank|interest rate|policy rate)\b/.test(t)) return 'central_bank';
  if (/\b(treasury|gdp|inflation|employment|cpi|jobs report)\b/.test(t)) return 'macro';
  if (/\b(un security council|united nations|treaty|embassy|diplomat)\b/.test(t)) return 'geopolitics';
  return 'geopolitics';
}

function severityFromText(text) {
  const t = text.toLowerCase();
  if (/\b(catastrophic|declaration of war|nuclear)\b/.test(t)) return 5;
  if (/\b(invasion|sanction|embargo|armed conflict|terror)\b/.test(t)) return 4;
  if (/\b(emergency|evacuation|missile|strike|halt trading)\b/.test(t)) return 3;
  if (/\b(airspace closure|ground stop|mass diversion|port closure|canal closure)\b/.test(t)) return 3;
  if (/\bnotam\b.*\b(closure|closed|grounding)\b/.test(t)) return 3;
  if (/\b(alert|warning|heightened|troops|naval)\b/.test(t)) return 2;
  return 1;
}

function extractCountries(text) {
  const t = text.toLowerCase();
  const found = [];
  for (const [phrase, code, lat, lng] of COUNTRY_HINTS) {
    if (t.includes(phrase) && !found.includes(code)) found.push(code);
  }
  return found;
}

function geolocateFromCountries(codes) {
  if (!codes || !codes.length) return { lat: null, lng: null, region: null };
  const first = codes[0];
  const row = COUNTRY_HINTS.find(([, c]) => c === first);
  if (!row) return { lat: null, lng: null, region: first };
  return { lat: row[2], lng: row[3], region: first };
}

function classifyRecord({ title, summary, body_snippet }) {
  const text = [title, summary, body_snippet].filter(Boolean).join(' \n ');
  const event_type = classifyEventType(text);
  const severity = severityFromText(text);
  const countries = extractCountries(text);
  const geo = geolocateFromCountries(countries);
  let sentiment = 'neutral';
  if (/\b(ease|deal|agreement|ceasefire|cut rates|growth)\b/i.test(text)) sentiment = 'positive';
  if (/\b(attack|sanction|crisis|default|recession|hike rates)\b/i.test(text)) sentiment = 'negative';

  return {
    event_type,
    severity,
    countries,
    lat: geo.lat,
    lng: geo.lng,
    region: geo.region,
    sentiment,
  };
}

module.exports = {
  classifyEventType,
  severityFromText,
  extractCountries,
  geolocateFromCountries,
  classifyRecord,
};
