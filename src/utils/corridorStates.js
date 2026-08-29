// R16. Which countries appear on the corridor board, so labor exposure can be
// read against corridor exposure. Derived from the existing board data rather
// than maintained as a second hand-written list.
import portData from '../data/port_data.json';
import sanctions from '../data/sanctions_regimes.json';
import laborData from '../data/global_labor.json';

const unwrap = (d) => (Array.isArray(d) ? d : Object.values(d).find(Array.isArray) || []);

// The board uses colloquial names; the labor dataset uses World Bank names.
const ALIASES = {
  UAE: 'United Arab Emirates',
  USA: 'United States',
  'United States of America': 'United States',
  Russia: 'Russian Federation',
  Iran: 'Iran, Islamic Rep.',
  Egypt: 'Egypt, Arab Rep.',
  Turkey: 'Turkiye',
  Türkiye: 'Turkiye',
  Syria: 'Syrian Arab Republic',
  Yemen: 'Yemen, Rep.',
  Venezuela: 'Venezuela, RB',
  'South Korea': 'Korea, Rep.',
  'North Korea': "Korea, Dem. People's Rep.",
  Congo: 'Congo, Dem. Rep.',
  'DR Congo': 'Congo, Dem. Rep.',
  Laos: 'Lao PDR',
  Slovakia: 'Slovak Republic',
  Kyrgyzstan: 'Kyrgyz Republic',
  Taiwan: 'Taiwan, China',
  'Hong Kong': 'Hong Kong SAR, China',
  Gambia: 'Gambia, The',
  Bahamas: 'Bahamas, The',
  Brunei: 'Brunei Darussalam',
  'Cape Verde': 'Cabo Verde',
  'Ivory Coast': "Cote d'Ivoire",
  Czechia: 'Czechia',
  Palestine: 'West Bank and Gaza',
};

const byName = new Map();
laborData.rows.forEach((r) => {
  if (r.row_type === 'country') byName.set(r.country_name.toLowerCase(), r.iso3);
});

function toIso3(name) {
  if (!name) return null;
  const canonical = ALIASES[name.trim()] || name.trim();
  return byName.get(canonical.toLowerCase()) || null;
}

const names = [
  ...unwrap(portData).map((p) => p.country),
  ...unwrap(sanctions).map((s) => s.target_country),
];

export const CORRIDOR_STATES = new Set(names.map(toIso3).filter(Boolean));

export const UNMATCHED_CORRIDOR_NAMES = [
  ...new Set(names.filter((n) => n && !toIso3(n))),
];
