/**
 * Map OpenSky `origin_country` strings to ISO2 when possible (improves country lens matching).
 * OpenSky often uses English country names; sometimes ISO2.
 */

const NAME_TO_ISO2 = {
  'united states': 'US',
  'united kingdom': 'GB',
  'great britain': 'GB',
  germany: 'DE',
  france: 'FR',
  italy: 'IT',
  spain: 'ES',
  netherlands: 'NL',
  belgium: 'BE',
  poland: 'PL',
  norway: 'NO',
  sweden: 'SE',
  finland: 'FI',
  denmark: 'DK',
  ireland: 'IE',
  portugal: 'PT',
  greece: 'GR',
  turkey: 'TR',
  'türkiye': 'TR',
  russia: 'RU',
  ukraine: 'UA',
  china: 'CN',
  japan: 'JP',
  'south korea': 'KR',
  'republic of korea': 'KR',
  india: 'IN',
  pakistan: 'PK',
  iran: 'IR',
  'islamic republic of iran': 'IR',
  iraq: 'IQ',
  israel: 'IL',
  jordan: 'JO',
  lebanon: 'LB',
  syria: 'SY',
  egypt: 'EG',
  'saudi arabia': 'SA',
  'united arab emirates': 'AE',
  qatar: 'QA',
  kuwait: 'KW',
  oman: 'OM',
  bahrain: 'BH',
  yemen: 'YE',
  canada: 'CA',
  mexico: 'MX',
  brazil: 'BR',
  argentina: 'AR',
  chile: 'CL',
  australia: 'AU',
  'new zealand': 'NZ',
  singapore: 'SG',
  malaysia: 'MY',
  thailand: 'TH',
  vietnam: 'VN',
  indonesia: 'ID',
  philippines: 'PH',
  taiwan: 'TW',
  'hong kong': 'HK',
  'south africa': 'ZA',
  nigeria: 'NG',
  kenya: 'KE',
  ethiopia: 'ET',
  morocco: 'MA',
  algeria: 'DZ',
  tunisia: 'TN',
  libya: 'LY',
  sudan: 'SD',
  afghanistan: 'AF',
  kazakhstan: 'KZ',
  uzbekistan: 'UZ',
  azerbaijan: 'AZ',
  armenia: 'AM',
  georgia: 'GE',
  romania: 'RO',
  hungary: 'HU',
  czechia: 'CZ',
  slovakia: 'SK',
  austria: 'AT',
  switzerland: 'CH',
  luxembourg: 'LU',
  croatia: 'HR',
  serbia: 'RS',
  bulgaria: 'BG',
  estonia: 'EE',
  latvia: 'LV',
  lithuania: 'LT',
  iceland: 'IS',
  malta: 'MT',
  cyprus: 'CY',
  venezuela: 'VE',
  colombia: 'CO',
  peru: 'PE',
  ecuador: 'EC',
  panama: 'PA',
  cuba: 'CU',
};

/**
 * @param {string|null|undefined} originCountry
 * @returns {string[]} ISO2 codes (0–1 entries)
 */
function countriesFromOpenskyOrigin(originCountry) {
  const raw = String(originCountry || '').trim();
  if (!raw) return [];
  const up = raw.toUpperCase();
  if (up.length === 2 && /^[A-Z]{2}$/.test(up) && up !== 'UK') return [up];
  if (up === 'UK') return ['GB'];
  const key = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const iso = NAME_TO_ISO2[key];
  if (iso) return [iso];
  return [];
}

module.exports = { countriesFromOpenskyOrigin, NAME_TO_ISO2 };
