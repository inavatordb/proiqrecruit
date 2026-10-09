/**
 * Recruiting platform -- pure logic (no store, no HTTP).
 *
 * Sport and division are DATA, not architecture: adding D3, NAIA, JUCO or
 * another sport means adding a row to SPORTS / DIVISIONS here and importing
 * programs for it. Nothing downstream hard-codes women's soccer.
 */
import crypto from 'node:crypto';

/* ------------------------------ vocabularies ------------------------------ */
export const SPORTS = {
  'womens-soccer': { label: "Women's Soccer", sport: 'soccer', gender: 'women', enabled: true },
  // Room to grow -- flip `enabled` once programs are imported:
  'mens-soccer': { label: "Men's Soccer", sport: 'soccer', gender: 'men', enabled: false },
  volleyball: { label: 'Volleyball', sport: 'volleyball', gender: 'women', enabled: false },
  'womens-basketball': { label: "Women's Basketball", sport: 'basketball', gender: 'women', enabled: false },
  softball: { label: 'Softball', sport: 'softball', gender: 'women', enabled: false },
  'womens-lacrosse': { label: "Women's Lacrosse", sport: 'lacrosse', gender: 'women', enabled: false },
};
export const DEFAULT_SPORT = 'womens-soccer';

export const DIVISIONS = {
  D1: { label: 'NCAA Division I', body: 'NCAA', populated: true },
  D2: { label: 'NCAA Division II', body: 'NCAA', populated: true },
  D3: { label: 'NCAA Division III', body: 'NCAA', populated: false },
  NAIA: { label: 'NAIA', body: 'NAIA', populated: false },
  JUCO: { label: 'Junior College (NJCAA)', body: 'NJCAA', populated: false },
};

export const VERIFICATION = ['verified', 'needs_review', 'historical', 'unverified', 'archived'];
export const PIPELINE_STAGES = [
  ['interested', 'Interested'], ['researching', 'Researching'], ['contacted', 'Contacted'],
  ['coach_responded', 'Coach Responded'], ['camp_attended', 'Camp Attended'], ['evaluation', 'Evaluation'],
  ['offer', 'Offer / Recruitment'], ['committed', 'Committed'], ['not_pursuing', 'Not Pursuing'],
];
export const PIPELINE_KEYS = PIPELINE_STAGES.map(([k]) => k);
export const CAMP_TYPES = ['ID Camp', 'Elite ID Camp', 'Residential Camp', 'College ID Camp', 'Prospect Camp', 'Youth Camp', 'Goalkeeper Camp', 'Team Camp', 'Summer Camp', 'Other'];
export const SOURCE_TYPES = ['NCAA', 'University Athletics', 'University Soccer', 'University Camp Website', 'Conference', 'United Soccer Coaches', 'Event Organizer', 'Other verified public source'];
/** Machine codes accepted in the source_type column, mapped to the labels shown in the UI. */
export const SOURCE_TYPE_CODES = {
  official_university: 'University Athletics', university_athletics: 'University Athletics', official_soccer: 'University Soccer',
  official_camp: 'University Camp Website', conference: 'Conference', ncaa: 'NCAA', united_soccer_coaches: 'United Soccer Coaches',
  external_event: 'Event Organizer', other: 'Other verified public source',
};
/** -> { code, label } or { code:'', label:'' } when blank/unknown (caller reports unknown). */
export function normSourceType(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return { code: '', label: '', blank: true };
  const code = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (SOURCE_TYPE_CODES[code]) return { code, label: SOURCE_TYPE_CODES[code] };
  const byLabel = Object.entries(SOURCE_TYPE_CODES).find(([, l]) => l.toLowerCase() === raw.toLowerCase());
  return byLabel ? { code: byLabel[0], label: byLabel[1] } : { code: '', label: '', unknown: raw };
}
export const RANKING_ORGS = ['United Soccer Coaches', 'NCAA', 'RPI', 'Massey', 'Other'];
export const RANKING_TYPES = ['preseason', 'weekly', 'final', 'highest'];
export const CONTACT_METHODS = ['email', 'phone', 'text', 'in_person', 'camp', 'social', 'other'];
export const PROFILE_PRIVACY = ['private', 'unlisted', 'public'];

export const PRIVATE_ENTITIES = ['RecruitPlayerProfile', 'RecruitTarget', 'RecruitNote', 'RecruitContact', 'RecruitActivity', 'RecruitCampTrack'];
export const CATALOG_ENTITIES = ['CollegeProgram', 'ProgramCoach', 'ProgramSeason', 'ProgramRanking', 'ProgramCamp', 'IDCampAppearance', 'ProgramConferenceHistory', 'DataSource', 'RecruitImport'];
export const RECRUITING_ENTITIES = new Set([...PRIVATE_ENTITIES, ...CATALOG_ENTITIES]);

export const KINDS = {
  programs: { entity: 'CollegeProgram', label: 'Programs' },
  coaches: { entity: 'ProgramCoach', label: 'Coaches' },
  seasons: { entity: 'ProgramSeason', label: 'Seasons' },
  rankings: { entity: 'ProgramRanking', label: 'Rankings' },
  camps: { entity: 'ProgramCamp', label: 'Camps' },
  idcamps: { entity: 'IDCampAppearance', label: 'ID Camp Appearances' },
  conference_history: { entity: 'ProgramConferenceHistory', label: 'Conference History' },
  sources: { entity: 'DataSource', label: 'Sources' },
};

/* -------------------------------- geography -------------------------------- */
const STATES = {
  AL: ['Alabama', 'Southeast', 32.8, -86.8], AK: ['Alaska', 'West', 64.2, -149.5], AZ: ['Arizona', 'Southwest', 34.3, -111.7],
  AR: ['Arkansas', 'Southeast', 34.9, -92.4], CA: ['California', 'West', 37.2, -119.7], CO: ['Colorado', 'West', 39.0, -105.5],
  CT: ['Connecticut', 'Northeast', 41.6, -72.7], DE: ['Delaware', 'Northeast', 39.0, -75.5], DC: ['District of Columbia', 'Northeast', 38.9, -77.0],
  FL: ['Florida', 'Southeast', 28.6, -82.4], GA: ['Georgia', 'Southeast', 32.7, -83.4], HI: ['Hawaii', 'West', 20.8, -156.3],
  ID: ['Idaho', 'West', 44.4, -114.6], IL: ['Illinois', 'Midwest', 40.0, -89.2], IN: ['Indiana', 'Midwest', 39.9, -86.3],
  IA: ['Iowa', 'Midwest', 42.1, -93.5], KS: ['Kansas', 'Midwest', 38.5, -98.4], KY: ['Kentucky', 'Southeast', 37.5, -85.3],
  LA: ['Louisiana', 'Southeast', 31.1, -92.0], ME: ['Maine', 'Northeast', 45.3, -69.2], MD: ['Maryland', 'Northeast', 39.0, -76.8],
  MA: ['Massachusetts', 'Northeast', 42.3, -71.8], MI: ['Michigan', 'Midwest', 44.3, -85.4], MN: ['Minnesota', 'Midwest', 46.3, -94.3],
  MS: ['Mississippi', 'Southeast', 32.7, -89.7], MO: ['Missouri', 'Midwest', 38.4, -92.5], MT: ['Montana', 'West', 47.0, -109.6],
  NE: ['Nebraska', 'Midwest', 41.5, -99.8], NV: ['Nevada', 'West', 39.3, -116.6], NH: ['New Hampshire', 'Northeast', 43.7, -71.6],
  NJ: ['New Jersey', 'Northeast', 40.2, -74.7], NM: ['New Mexico', 'Southwest', 34.4, -106.1], NY: ['New York', 'Northeast', 42.9, -75.5],
  NC: ['North Carolina', 'Southeast', 35.6, -79.4], ND: ['North Dakota', 'Midwest', 47.5, -100.5], OH: ['Ohio', 'Midwest', 40.3, -82.8],
  OK: ['Oklahoma', 'Southwest', 35.6, -97.5], OR: ['Oregon', 'West', 44.0, -120.5], PA: ['Pennsylvania', 'Northeast', 40.9, -77.8],
  RI: ['Rhode Island', 'Northeast', 41.7, -71.5], SC: ['South Carolina', 'Southeast', 33.9, -80.9], SD: ['South Dakota', 'Midwest', 44.4, -100.2],
  TN: ['Tennessee', 'Southeast', 35.9, -86.4], TX: ['Texas', 'Southwest', 31.5, -99.3], UT: ['Utah', 'West', 39.3, -111.7],
  VT: ['Vermont', 'Northeast', 44.0, -72.7], VA: ['Virginia', 'Southeast', 37.5, -78.8], WA: ['Washington', 'West', 47.4, -120.5],
  WV: ['West Virginia', 'Southeast', 38.6, -80.6], WI: ['Wisconsin', 'Midwest', 44.6, -89.9], WY: ['Wyoming', 'West', 43.0, -107.5],
};
const NAME_TO_ABBR = Object.fromEntries(Object.entries(STATES).map(([a, [n]]) => [n.toLowerCase(), a]));
export const REGIONS = ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West'];
export const STATE_LIST = Object.entries(STATES).map(([abbr, [name, region]]) => ({ abbr, name, region }));

/** 'Texas' | 'TX' | 'tx' -> 'TX'; unknown (e.g. a Canadian province) -> trimmed input. */
export function stateAbbr(v) {
  const s = String(v ?? '').replace(/[‘’ʻ']/g, '').trim(); // "Hawai'i" -> "Hawaii"
  if (!s) return '';
  const up = s.toUpperCase();
  if (STATES[up]) return up;
  return NAME_TO_ABBR[s.toLowerCase()] || s;
}
export function regionForState(v) {
  const a = stateAbbr(v);
  return STATES[a] ? STATES[a][1] : (a ? 'International' : '');
}
/** Straight-line miles between two state centers. Approximate by design. */
export function stateDistanceMiles(a, b) {
  const A = STATES[stateAbbr(a)]; const B = STATES[stateAbbr(b)];
  if (!A || !B) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(B[2] - A[2]); const dLng = rad(B[3] - A[3]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(A[2])) * Math.cos(rad(B[2])) * Math.sin(dLng / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.asin(Math.sqrt(h)));
}

/* --------------------------------- scalars --------------------------------- */
export const slugify = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
export const shortHash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

export const str = (v, max = 600) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const text = (v, max = 5000) => String(v ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
/** http(s) only -- imported/admin-entered URLs end up in href attributes. */
export function safeUrl(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.toString().slice(0, 600) : '';
  } catch { return ''; }
}
export const toBool = (v) => (typeof v === 'boolean' ? v : /^(1|true|yes|y|x)$/i.test(String(v ?? '').trim()));
export const toInt = (v) => { const n = parseInt(String(v ?? '').trim(), 10); return Number.isFinite(n) ? n : null; };
export function toList(v) {
  if (Array.isArray(v)) return v.map((x) => str(x, 200)).filter(Boolean);
  return String(v ?? '').split(/[;|]/).map((x) => str(x, 200)).filter(Boolean);
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const validYmd = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };
/** Strict: YYYY-MM-DD, M/D/YYYY, or "Jul 15, 2026". Anything else is '' (and the importer reports it). */
export function toDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m && validYmd(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m && validYmd(+m[3], +m[1], +m[2])) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/);
  const mi = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1;
  if (m && mi >= 0 && validYmd(+m[3], mi + 1, +m[2])) return `${m[3]}-${pad(mi + 1)}-${pad(m[2])}`;
  return '';
}
const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;
const PERSONAL_DOMAINS = /(^|\.)(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton(mail)?|pm|gmx|mail|comcast|verizon|att|sbcglobal|cox|qq)\.(com|net|me)$/i;
export const isEmail = (v) => EMAIL_RE.test(String(v ?? '').trim());
/** Personal webmail is never stored or shown as a coach contact. */
export const isPersonalEmail = (v) => PERSONAL_DOMAINS.test(String(v ?? '').trim().split('@')[1] || '');
export const normVerification = (v, fallback = 'unverified') => {
  const s = String(v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return VERIFICATION.includes(s) ? s : fallback;
};

/* ----------------------------------- CSV ----------------------------------- */
export function parseCsv(input) { return parseCsvWithHeader(input).rows; }
export function parseCsvWithHeader(input) {
  const src = String(input ?? '').replace(/^﻿/, '');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return { header, rows: rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}
export function toCsv(rows, columns) {
  if (!rows.length) return '';
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return `${cols.join(',')}\n${rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n')}\n`;
}

/* ------------------------------ program helpers ----------------------------- */
export const programIdFor = (sport, slug) => `prg_${sport}_${slug}`;

export function coachRole(title) {
  const t = String(title ?? '').toLowerCase();
  if (/associate head|assoc\.? head/.test(t)) return 'associate_head';
  if (/recruit/.test(t)) return 'recruiting_coordinator';
  if (/goalkeeper|goalie|\bgk\b/.test(t)) return 'goalkeeper';
  if (/volunteer/.test(t)) return 'volunteer';
  if (/operations|ops\b/.test(t)) return 'director_ops';
  if (/^head coach|^interim head|head women|head soccer|\bhead coach\b/.test(t) && !/assistant/.test(t)) return 'head';
  if (/assistant|asst/.test(t)) return 'assistant';
  return 'other';
}
export const COACH_ROLE_ORDER = ['head', 'associate_head', 'assistant', 'recruiting_coordinator', 'goalkeeper', 'director_ops', 'volunteer', 'other'];
export const COACH_ROLE_LABEL = {
  head: 'Head Coach', associate_head: 'Associate Head Coach', assistant: 'Assistant Coach', recruiting_coordinator: 'Recruiting Coordinator',
  goalkeeper: 'Goalkeeper Coach', director_ops: 'Director of Operations', volunteer: 'Volunteer Assistant', other: 'Staff',
};

export const currentYear = (d = new Date()) => d.getUTCFullYear();
/** NCAA fall seasons end in December, so a season is "completed" once its year has passed. */
export const isCompletedSeason = (season, now = new Date()) => Number(season) < currentYear(now);

export function winPct(w, l, t) {
  const g = (w ?? 0) + (l ?? 0) + (t ?? 0);
  return g > 0 && w != null && l != null ? Math.round((((w ?? 0) + 0.5 * (t ?? 0)) / g) * 1000) / 1000 : null;
}

const NCAA_ROUNDS = ['first round', 'second round', 'round of 16', 'third round', 'quarterfinal', 'quarterfinals', 'semifinal', 'semifinals', 'national semifinal', 'runner-up', 'final', 'national runner-up', 'national champion', 'champion', 'national champions'];
export const NCAA_ROUND_RANK = { 'first round': 1, 'second round': 2, 'round of 32': 2, 'round of 16': 3, 'third round': 3, quarterfinal: 4, quarterfinals: 4, semifinal: 5, semifinals: 5, 'national semifinal': 5, 'runner-up': 6, 'national runner-up': 6, final: 6, champion: 7, 'national champion': 7, 'national champions': 7 };
export const roundRank = (r) => NCAA_ROUND_RANK[String(r ?? '').trim().toLowerCase()] || 0;
export { NCAA_ROUNDS };

/* ----------------------------- import normalizers ---------------------------- */

/** Resolve sport + gender columns ("soccer" + "women") or a combined id ("womens-soccer"). */
export function resolveSport(sportRaw, genderRaw) {
  const s = String(sportRaw || DEFAULT_SPORT).trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (SPORTS[s]) return s;
  const g = String(genderRaw || '').trim().toLowerCase();
  const prefix = /^(w|women|womens|female|girls)/.test(g) ? 'womens-' : /^(m|men|mens|male|boys)/.test(g) ? 'mens-' : '';
  return [`${prefix}${s}`, s].find((k) => SPORTS[k]) || '';
}

/**
 * Common record fields. A row is only "verified" when it says so AND names a source;
 * everything else is Needs Review. Never invents data.
 */
function base(row, id) {
  const st = normSourceType(row.source_type);
  const explicit = String(row.verification_status || '').trim();
  const status = explicit ? normVerification(explicit, 'needs_review') : (toBool(row.verified) ? 'verified' : 'needs_review');
  return {
    id,
    verification_status: status,
    source_url: safeUrl(row.source_url),
    source_name: str(row.source_name, 160),
    source_type: st.label,
    source_type_code: st.code,
    last_verified_at: toDate(row.last_verified_at) || '',
    notes: text(row.notes, 2000),
  };
}

/** Child rows: program_id may be our program code (ACC_DUKE_WSOC) or internal id; school_name is a fallback only when program_id is absent. */
const programRef = (row, ctx) => ctx.resolveProgram(row) || null;

const programNotFound = (row) => [`program not found: ${row.program_id ? `program_id "${row.program_id}" matches no program` : `no program_id given and school_name "${row.school_name || ''}" matches no program`}`];

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,59}$/;

export const NORMALIZERS = {
  programs(row, ctx) {
    const errors = []; const warnings = [];
    const name = str(row.school_name || row.school || row.institution, 160);
    const sport = resolveSport(row.sport, row.gender);
    const division = str(row.division || row.ncaa_division, 10).toUpperCase().replace(/^NCAA\s*/, '').replace(/^DIVISION\s*/, '').replace(/^III$/, 'D3').replace(/^II$/, 'D2').replace(/^I$/, 'D1');
    const divKey = /^D?[123]$/.test(division) ? `D${division.replace('D', '')}` : division;
    const rawId = str(row.program_id, 80);
    const isInternal = /^prg_/.test(rawId);
    const code = rawId && !isInternal ? rawId.toUpperCase() : '';
    if (!name) errors.push('school_name is required');
    if (!sport) errors.push(`unknown sport/gender "${row.sport || ''}"/"${row.gender || ''}"`);
    if (!DIVISIONS[divKey]) errors.push(`unknown division "${row.division || ''}" (use D1, D2, D3, NAIA or JUCO)`);
    if (code && !CODE_RE.test(code)) errors.push(`program_id "${rawId}" must be 3-60 letters, digits, _ or - (e.g. ACC_DUKE_WSOC)`);
    if (errors.length) return { errors };
    if (!rawId) warnings.push('no program_id: matched by school name only; add a stable program_id (e.g. ACC_DUKE_WSOC)');

    const hit = ctx.findProgram({ ...row, sport, program_code: code, internal_id: isInternal ? rawId : '' });
    const slug = hit ? hit.slug : ctx.programSlug(row, name, sport);
    const state = stateAbbr(row.state);
    const conference = str(row.conference, 160);
    if (hit && conference && hit.conference && hit.conference !== conference) {
      warnings.push(`current conference changes "${hit.conference}" → "${conference}": add conference_history rows so the earlier affiliation is kept`);
    }
    if (hit && code && hit.program_code && hit.program_code !== code) warnings.push(`program already has code ${hit.program_code}; it will be replaced by ${code}`);
    const record = {
      ...base(row, hit ? hit.id : programIdFor(sport, slug)),
      program_code: code || hit?.program_code || '',
      slug, sport, division: divKey, governing_body: DIVISIONS[divKey].body, gender: str(row.gender, 20).toLowerCase() || SPORTS[sport].gender,
      school_name: name,
      official_school_name: str(row.official_school_name, 200) || hit?.official_school_name || name,
      nickname: str(row.nickname, 80),
      conference,
      conference_slug: slugify(conference),
      city: str(row.city, 100), state, state_name: STATES[state]?.[0] || '',
      region: str(row.region, 30) || regionForState(state),
      school_website: safeUrl(row.school_website),
      athletics_website: safeUrl(row.athletics_website),
      team_website: safeUrl(row.team_website || row.soccer_website || row.womens_soccer_website || row.program_url),
      schedule_url: safeUrl(row.schedule_url || row.womens_soccer_schedule_url),
      roster_url: safeUrl(row.roster_url || row.womens_soccer_roster_url),
      camps_url: safeUrl(row.camps_url || row.official_camps_url),
      admissions_url: safeUrl(row.admissions_url),
      academic_info: text(row.academic_info || row.academic_information, 3000),
      academic_programs: toList(row.academic_programs),
      majors_url: safeUrl(row.majors_url),
      gpa_expectation: str(row.gpa_expectation, 60),
      acceptance_rate: row.acceptance_rate === '' || row.acceptance_rate == null ? null : Number(row.acceptance_rate) || null,
      enrollment: toInt(row.enrollment),
      public_private: ['Public', 'Private'].includes(str(row.public_private)) ? str(row.public_private) : '',
      school_type: str(row.school_type, 80),
      logo_url: safeUrl(row.logo_url),
      description: text(row.program_description || row.description, 4000),
      active: row.active === '' || row.active == null ? true : toBool(row.active),
    };
    if (record.program_code) {
      const owner = ctx.codeOwner(record.program_code, record.id);
      if (owner) return { errors: [`duplicate program_id ${record.program_code}: already used by ${owner}`] };
      ctx.claimCode(record.program_code, record.id, name);
    }
    for (const k of ['school_website', 'athletics_website', 'soccer_website', 'camps_url']) {
      if (str(row[k]) && !safeUrl(row[k])) warnings.push(`${k} "${str(row[k], 60)}" is not a valid http(s) URL and was dropped`);
    }
    return { record, warnings };
  },

  coaches(row, ctx) {
    const prog = programRef(row, ctx);
    if (!prog) return { errors: programNotFound(row) };
    const first = str(row.first_name, 80); const last = str(row.last_name, 80);
    if (!first || !last) return { errors: ['first_name and last_name are required'] };
    const warnings = [];
    let email = str(row.email, 160).toLowerCase();
    if (email && !isEmail(email)) { warnings.push(`email "${email}" is malformed and was dropped`); email = ''; }
    if (email && isPersonalEmail(email)) { warnings.push('personal webmail address dropped (only public institutional contacts are stored)'); email = ''; }
    const title = str(row.title, 120);
    return {
      record: {
        ...base(row, `coach_${shortHash(prog.id)}_${slugify(`${first}-${last}`)}`),
        program_id: prog.id, sport: prog.sport, first_name: first, last_name: last, title, role: coachRole(title),
        email, phone: str(row.phone, 40), bio_url: safeUrl(row.bio_url || row.coaching_bio_url), profile_url: safeUrl(row.profile_url),
        years_at_program: toInt(row.years_at_program), previous_schools: toList(row.previous_schools),
        active: row.active === '' || row.active == null ? true : toBool(row.active),
      },
      warnings,
    };
  },

  seasons(row, ctx) {
    const prog = programRef(row, ctx);
    if (!prog) return { errors: programNotFound(row) };
    const season = toInt(row.season);
    if (!season || season < 1990 || season > 2100 || !/^\d{4}$/.test(str(row.season))) return { errors: ['season must be a 4-digit year like 2025'] };
    const w = toInt(row.wins); const l = toInt(row.losses); const t = toInt(row.ties);
    const cw = toInt(row.conference_wins); const cl = toInt(row.conference_losses); const ct = toInt(row.conference_ties);
    const confRecord = str(row.conference_record, 30) || (cw != null && cl != null ? `${cw}-${cl}${ct != null ? `-${ct}` : ''}` : '');
    const appears = row.ncaa_tournament_appearance === '' || row.ncaa_tournament_appearance == null ? undefined : toBool(row.ncaa_tournament_appearance);
    const warnings = [];
    if (appears === true && !str(row.ncaa_tournament_round)) warnings.push('NCAA appearance without a round');
    if (appears === false && str(row.ncaa_tournament_round)) warnings.push('ncaa_round given but ncaa_appearance is no');
    return {
      record: {
        ...base(row, `season_${shortHash(prog.id)}_${season}`),
        program_id: prog.id, sport: prog.sport, season, is_current_season: season >= currentYear(), wins: w, losses: l, ties: t,
        winning_percentage: row.winning_percentage ? Number(row.winning_percentage) || winPct(w, l, t) : winPct(w, l, t),
        conference_wins: cw, conference_losses: cl, conference_ties: ct, conference_record: confRecord,
        conference: str(row.conference, 160),
        conference_finish: str(row.conference_finish, 80),
        regular_season_finish: str(row.regular_season_finish, 80), conference_tournament_result: str(row.conference_tournament_result, 120),
        conference_champion: row.conference_champion === '' || row.conference_champion == null ? undefined : toBool(row.conference_champion),
        ncaa_tournament_appearance: appears,
        ncaa_tournament_round: str(row.ncaa_tournament_round, 60),
        postseason_result: str(row.postseason_result, 160),
        goals_for: toInt(row.goals_for), goals_against: toInt(row.goals_against),
      },
      warnings,
    };
  },

  rankings(row, ctx) {
    const prog = programRef(row, ctx);
    if (!prog) return { errors: programNotFound(row) };
    const season = toInt(row.season);
    const rank = toInt(row.rank);
    if (!season) return { errors: ['season is required'] };
    if (!rank || rank < 1 || rank > 400) return { errors: ['ranking must be a positive number'] };
    const warnings = [];
    const orgRaw = str(row.organization || row.ranking_organization);
    const org = RANKING_ORGS.find((o) => o.toLowerCase() === orgRaw.toLowerCase()) || 'Other';
    if (!orgRaw) warnings.push('no ranking_organization (stored as Other)');
    else if (org === 'Other' && orgRaw.toLowerCase() !== 'other') warnings.push(`unrecognized organization "${orgRaw}" stored as Other`);
    // "Week 4" / "week_8" are weekly rankings; the number is kept as the week.
    const typeRaw = str(row.ranking_type).toLowerCase().replace(/[\s_]+/g, ' ');
    const wk = typeRaw.match(/^week ?(\d{1,2})$/);
    const type = wk ? 'weekly' : RANKING_TYPES.includes(typeRaw) ? typeRaw : 'weekly';
    if (typeRaw && !wk && !RANKING_TYPES.includes(typeRaw)) warnings.push(`ranking_type "${typeRaw}" not recognized; stored as weekly`);
    const date = toDate(row.ranking_date); const week = str(row.week, 20) || (wk ? wk[1] : '');
    if (type === 'weekly' && !date && !week) warnings.push('weekly ranking without a ranking_date or week: records for the same school/season may collide');
    return {
      record: {
        ...base(row, `rank_${shortHash(prog.id)}_${season}_${slugify(org)}_${type}_${date || week || 'x'}`),
        program_id: prog.id, sport: prog.sport, season, organization: org, ranking_type: type, rank, ranking_date: date, week,
      },
      warnings,
    };
  },

  camps(row, ctx) {
    const prog = programRef(row, ctx);
    if (!prog) return { errors: programNotFound(row) };
    const name = str(row.camp_name || row.name, 200);
    const date = toDate(row.camp_date || row.start_date);
    if (!name) return { errors: ['camp_name is required'] };
    if (!date) return { errors: ['start_date is required (YYYY-MM-DD)'] };
    const warnings = [];
    const typeRaw = str(row.camp_type);
    const type = CAMP_TYPES.find((c) => c.toLowerCase() === typeRaw.toLowerCase()) || 'Other';
    if (typeRaw && type === 'Other' && typeRaw.toLowerCase() !== 'other') warnings.push(`camp_type "${typeRaw}" not recognized; stored as Other`);
    const end = toDate(row.end_date);
    if (end && end < date) return { errors: ['end_date is before start_date'] };
    const season = toInt(row.season);
    if (season && season !== Number(date.slice(0, 4))) warnings.push(`season ${season} does not match the start_date year ${date.slice(0, 4)}`);
    const contact = str(row.contact_email, 160).toLowerCase();
    if (contact && (!isEmail(contact) || isPersonalEmail(contact))) warnings.push('contact_email dropped (malformed or personal webmail)');
    if (!safeUrl(row.official_camp_url) && !safeUrl(row.registration_url)) warnings.push('no official_url or registration_url');
    return {
      record: {
        ...base(row, `camp_${shortHash(prog.id)}_${date}_${slugify(name).slice(0, 40)}`),
        program_id: prog.id, sport: prog.sport, camp_name: name, camp_type: type, camp_date: date, end_date: end,
        year: season || Number(date.slice(0, 4)),
        registration_deadline: toDate(row.registration_deadline), location: str(row.location, 200), age_range: str(row.age_range, 60),
        graduation_years: toList(row.graduation_years), gender: str(row.gender, 30), cost: str(row.cost, 60),
        description: text(row.description, 3000), registration_url: safeUrl(row.registration_url),
        official_camp_url: safeUrl(row.official_camp_url),
        contact_email: contact && isEmail(contact) && !isPersonalEmail(contact) ? contact : '', contact_phone: str(row.contact_phone, 40),
        official: true,
      },
      warnings,
    };
  },

  idcamps(row, ctx) {
    const prog = programRef(row, ctx);
    if (!prog) return { errors: programNotFound(row) };
    const name = str(row.event_name || row.name, 200);
    const date = toDate(row.event_date || row.date);
    if (!name) return { errors: ['event_name is required'] };
    if (!date) return { errors: ['event_date is required (YYYY-MM-DD)'] };
    const warnings = [];
    // coach_id is optional: an exact coach id, or "first-last" of a coach already on this program.
    let coachId = str(row.coach_id, 120);
    if (coachId) {
      const hit = ctx.resolveCoach(prog.id, coachId);
      if (hit) coachId = hit.id; else { warnings.push(`coach_id "${coachId}" matches no coach on this program; kept as advertised text only`); coachId = ''; }
    }
    return {
      record: {
        ...base(row, `idc_${shortHash(prog.id)}_${date}_${slugify(name).slice(0, 40)}`),
        program_id: prog.id, sport: prog.sport, coach_id: coachId, event_name: name,
        event_organization: str(row.event_organization || row.organization || row.organizer, 160), event_date: date, year: Number(date.slice(0, 4)),
        location: str(row.location, 200), event_type: str(row.event_type, 80), registration_url: safeUrl(row.registration_url),
        advertised_school: str(row.advertised_school, 160), advertised_coach: str(row.advertised_coach, 160),
        official: false,
      },
      warnings,
    };
  },

  conference_history(row, ctx) {
    const prog = programRef(row, ctx);
    if (!prog) return { errors: programNotFound(row) };
    const conference = str(row.conference, 160);
    if (!conference) return { errors: ['conference is required'] };
    const startRaw = str(row.start_season); const endRaw = str(row.end_season);
    const start = toInt(startRaw); const end = toInt(endRaw);
    if (startRaw && (!/^\d{4}$/.test(startRaw) || !start)) return { errors: ['start_season must be a 4-digit year (or blank if unknown)'] };
    if (endRaw && (!/^\d{4}$/.test(endRaw) || !end)) return { errors: ['end_season must be a 4-digit year (or blank if still a member)'] };
    if (start && end && end < start) return { errors: ['end_season is before start_season'] };
    const warnings = [];
    if (!start) warnings.push('start_season blank: membership start unknown');
    return {
      record: {
        ...base(row, `confhist_${shortHash(prog.id)}_${slugify(conference).slice(0, 40)}_${start || 'x'}`),
        program_id: prog.id, sport: prog.sport, conference, conference_slug: slugify(conference), start_season: start, end_season: end,
      },
      warnings,
    };
  },
};

/* ---- header handling: aliases, required and known columns ---- */

/** Alias header -> canonical field read by the normalizers, per kind. */
export const ALIASES = {
  programs: { soccer_website: 'team_website', womens_soccer_website: 'team_website' },
  seasons: { ncaa_appearance: 'ncaa_tournament_appearance', ncaa_round: 'ncaa_tournament_round' },
  rankings: { ranking_organization: 'organization', ranking: 'rank' },
  camps: { start_date: 'camp_date', official_url: 'official_camp_url', grad_years: 'graduation_years' },
  idcamps: { organization: 'event_organization' },
};

/** Any-of groups: each inner array needs at least one of its columns present in the header. */
export const REQUIRED_COLUMNS = {
  programs: [['school_name']],
  coaches: [['program_id', 'school_name'], ['first_name'], ['last_name']],
  seasons: [['program_id', 'school_name'], ['season']],
  rankings: [['program_id', 'school_name'], ['season'], ['ranking', 'rank'], ['ranking_organization', 'organization']],
  camps: [['program_id', 'school_name'], ['camp_name', 'name'], ['start_date', 'camp_date']],
  idcamps: [['program_id', 'school_name'], ['event_name', 'name'], ['event_date', 'date']],
  conference_history: [['program_id', 'school_name'], ['conference']],
};

/** Optional columns we also understand beyond the templates. */
const EXTRA_COLUMNS = ['verification_status', 'source_name', 'school_name', 'official_school_name', 'nickname', 'region', 'division', 'gender', 'sport',
  'active', 'academic_info', 'academic_programs', 'gpa_expectation', 'enrollment', 'acceptance_rate', 'public_private', 'school_type', 'logo_url', 'admissions_url',
  'schedule_url', 'roster_url', 'bio_url', 'years_at_program', 'previous_schools', 'conference', 'conference_record', 'conference_champion', 'regular_season_finish',
  'postseason_result', 'week', 'description', 'gender', 'contact_email', 'contact_phone', 'ncaa_tournament_appearance', 'ncaa_tournament_round', 'camp_date',
  'official_camp_url', 'graduation_years', 'event_organization', 'advertised_school', 'advertised_coach', 'rank', 'name', 'date'];

export function checkColumns(kind, header) {
  const have = new Set(header);
  const missing = (REQUIRED_COLUMNS[kind] || []).filter((group) => !group.some((c) => have.has(c))).map((g) => g.join(' or '));
  const known = new Set([...String(CSV_TEMPLATES[kind] || '').split('\n')[0].split(','), ...Object.keys(ALIASES[kind] || {}), ...Object.values(ALIASES[kind] || {}), ...EXTRA_COLUMNS]);
  const unknown = header.filter((h) => h && !known.has(h));
  const notes = [];
  if (kind !== 'programs' && !have.has('program_id')) notes.push('no program_id column: rows are matched by school_name only');
  if (kind === 'programs' && !have.has('program_id')) notes.push('no program_id column: programs are matched by school name only');
  if (!have.has('source_url')) notes.push('no source_url column: every record will be flagged Needs Review');
  return { missing, unknown, notes, blocked: missing.length > 0 };
}

export function applyAliases(kind, row) {
  const map = ALIASES[kind]; if (!map) return row;
  const out = { ...row };
  for (const [alias, canon] of Object.entries(map)) if (out[alias] !== undefined && (out[canon] === undefined || out[canon] === '')) out[canon] = out[alias];
  return out;
}

/** Date columns that, if filled but unreadable, must be reported rather than silently dropped. */
const DATE_COLUMNS = {
  programs: { optional: ['last_verified_at'] },
  coaches: { optional: ['last_verified_at'] },
  seasons: { optional: ['last_verified_at'] },
  rankings: { optional: ['ranking_date', 'last_verified_at'] },
  camps: { required: ['camp_date'], optional: ['end_date', 'registration_deadline', 'last_verified_at'] },
  idcamps: { required: ['event_date'], optional: ['last_verified_at'] },
  conference_history: { optional: ['last_verified_at'] },
};
function checkDates(kind, row) {
  const cfg = DATE_COLUMNS[kind] || {}; const errors = []; const warnings = [];
  for (const c of cfg.required || []) if (str(row[c]) && !toDate(row[c])) errors.push(`${c} "${str(row[c], 30)}" is not a valid date (use YYYY-MM-DD)`);
  for (const c of cfg.optional || []) if (str(row[c]) && !toDate(row[c])) warnings.push(`${c} "${str(row[c], 30)}" is not a valid date and was ignored`);
  return { errors, warnings };
}

/** Fields that never count as a "difference" when comparing an import row to a stored one. */
const META = new Set(['id', 'created_date', 'updated_date', 'last_verified_at', 'created_by', 'data_verified', 'origin', 'edited_by']);

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isBlank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Decide what an import row would do. Blank incoming values NEVER erase stored
 * ones, so layered imports (programs, then NCAA rounds, then records) compose.
 */
const PROVENANCE = new Set(["source_url", "source_name", "source_type", "source_type_code"]);
export function diffRecord(existing, incoming, ignoreProvenance = false) {
  const changes = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (META.has(k) || k === "verification_status" || isBlank(v) || (ignoreProvenance && PROVENANCE.has(k))) continue;
    if (!sameValue(existing[k], v)) changes[k] = v;
  }
  return changes;
}

const isExampleRow = (row) => /^\s*EXAMPLE ROW/i.test(String(row.notes || ''));

/**
 * Plan an import without touching the store. Every input row yields exactly one
 * item (new / update / skipped / duplicate / review / error) -- nothing is dropped silently.
 * ctx: { existing(id), resolveProgram(row), findProgram(row), programSlug(row,name,sport), resolveCoach(programId, ref) }
 */
export function planImport(kind, rows, ctx, { overwriteVerified = false, ignoreProvenance = false } = {}) {
  const normalize = NORMALIZERS[kind];
  if (!normalize) throw new Error(`Unknown import kind "${kind}"`);
  const seen = new Set();
  const items = [];
  const summary = { found: rows.length, new: 0, updated: 0, skipped: 0, duplicate: 0, errors: 0, review: 0, warnings: 0, missing_email: 0, example: 0 };
  rows.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const labelRaw = str(raw.school_name || raw.program_id || raw.camp_name || raw.event_name || `${raw.first_name || ''} ${raw.last_name || ''}`, 120);
    if (isExampleRow(raw)) {
      summary.skipped++; summary.example++;
      items.push({ line, action: 'skipped', label: labelRaw, messages: ['example row ignored (notes start with "EXAMPLE ROW")'] });
      return;
    }
    const row = applyAliases(kind, raw);
    const dates = checkDates(kind, row);
    let res;
    if (dates.errors.length) res = { errors: dates.errors };
    else { try { res = normalize(row, ctx); } catch (e) { res = { errors: [String(e.message || e)] }; } }
    if (res.errors?.length) {
      summary.errors++;
      items.push({ line, action: 'error', label: labelRaw, messages: res.errors });
      return;
    }
    const rec = res.record;
    const label = labelFor(kind, rec);
    const messages = [...(res.warnings || []), ...dates.warnings];
    // A record is only Verified if it names where it was verified.
    if (rec.verification_status === 'verified' && !rec.source_url) { rec.verification_status = 'needs_review'; messages.push('marked verified but has no source_url: set to Needs Review'); }
    else if (!rec.source_url) messages.push('no source_url');
    const st = normSourceType(row.source_type);
    if (st.unknown) messages.push(`source_type "${st.unknown}" not recognized (use official_university, conference, external_event, ncaa, united_soccer_coaches, other)`);
    if (kind === 'coaches' && !rec.email) summary.missing_email++;

    if (seen.has(rec.id)) {
      summary.duplicate++; summary.skipped++;
      items.push({ line, action: 'duplicate', id: rec.id, label, messages: ['appears more than once in this file; later row ignored'] });
      return;
    }
    seen.add(rec.id);
    const prev = ctx.existing(rec.id);
    if (messages.length) summary.warnings++;
    if (!prev) {
      summary.new++;
      if (messages.length) summary.review++;
      items.push({ line, action: 'new', id: rec.id, label, messages, record: rec, flagged: messages.length > 0 });
      return;
    }
    const changes = diffRecord(prev, rec, ignoreProvenance);
    // Checking a record against an official source is itself a change, even when every value already matched.
    if (rec.verification_status === 'verified' && prev.verification_status !== 'verified') changes.verification_status = 'verified';
    if (!Object.keys(changes).length) {
      summary.skipped++; summary.duplicate++;
      items.push({ line, action: 'duplicate', id: rec.id, label, messages: ['already up to date'] });
      return;
    }
    if (prev.verification_status === 'verified' && !overwriteVerified) {
      summary.review++;
      items.push({ line, action: 'review', id: rec.id, label, messages: ['verified record differs from file; not overwritten', ...messages], changes: Object.keys(changes), record: rec, proposed: changes });
      return;
    }
    summary.updated++;
    if (messages.length) summary.review++;
    items.push({ line, action: 'update', id: rec.id, label, messages, changes: Object.keys(changes), record: rec, proposed: changes, flagged: messages.length > 0 });
  });
  return { kind, items, summary };
}

function labelFor(kind, r) {
  switch (kind) {
    case 'programs': return `${r.school_name} (${r.division})${r.program_code ? ` · ${r.program_code}` : ''}`;
    case 'coaches': return `${r.first_name} ${r.last_name} — ${r.title || 'staff'}`;
    case 'seasons': return `${r.season} season${r.is_current_season ? ' (current)' : ''}`;
    case 'rankings': return `${r.season} ${r.organization} ${r.ranking_type}${r.week ? ` wk ${r.week}` : ''} #${r.rank}`;
    case 'camps': return `${r.camp_name} (${r.camp_date})`;
    case 'idcamps': return `${r.event_name} (${r.event_date})`;
    case 'conference_history': return `${r.conference} ${r.start_season || '?'}–${r.end_season || 'present'}`;
    default: return r.id;
  }
}

/* --------------------------------- templates -------------------------------- */
/** Header rows exactly as specified; the example row is ignored by the importer (notes start with EXAMPLE ROW). */
export const TEMPLATE_HEADERS = {
  programs: 'program_id,school_name,sport,gender,division,conference,city,state,school_website,athletics_website,soccer_website,camps_url,source_url,source_type,verified,last_verified_at,notes',
  coaches: 'program_id,first_name,last_name,title,email,phone,profile_url,source_url,source_type,verified,last_verified_at,notes',
  program_seasons: 'program_id,season,wins,losses,ties,conference_wins,conference_losses,conference_ties,conference_finish,conference_tournament_result,ncaa_appearance,ncaa_round,goals_for,goals_against,source_url,source_type,verified,last_verified_at,notes',
  rankings: 'program_id,season,ranking_organization,ranking_type,ranking,ranking_date,source_url,source_type,verified,last_verified_at,notes',
  camps: 'program_id,camp_name,camp_type,start_date,end_date,registration_deadline,location,age_range,grad_years,cost,registration_url,official_url,season,source_url,source_type,verified,last_verified_at,notes',
  id_camp_appearances: 'program_id,coach_id,event_name,organization,event_date,location,event_type,registration_url,source_url,source_type,verified,last_verified_at,notes',
  conference_history: 'program_id,conference,start_season,end_season,source_url,source_type,verified,last_verified_at,notes',
};
const EX = 'EXAMPLE ROW - delete before importing (ignored by the importer)';
export const TEMPLATE_EXAMPLES = {
  programs: `ACC_EXAMPLE_WSOC,Example University,soccer,women,D1,Atlantic Coast Conference,Example City,NC,https://example.edu,https://example-athletics.com,https://example-athletics.com/womens-soccer,https://example-athletics.com/camps,https://example-athletics.com/womens-soccer,official_university,no,,${EX}`,
  coaches: `ACC_EXAMPLE_WSOC,Jane,Coach,Head Coach,,,https://example-athletics.com/coach/jane,https://example-athletics.com/womens-soccer/coaches,official_university,no,,${EX}`,
  program_seasons: `ACC_EXAMPLE_WSOC,2025,14,4,2,7,1,1,2nd,Semifinal,yes,Round of 16,38,15,https://example-athletics.com/womens-soccer/2025,official_university,no,,${EX}`,
  rankings: `ACC_EXAMPLE_WSOC,2025,United Soccer Coaches,Week 4,12,2025-09-23,https://example.com/poll,united_soccer_coaches,no,,${EX}`,
  camps: `ACC_EXAMPLE_WSOC,Summer ID Camp,ID Camp,2026-07-15,2026-07-16,2026-07-01,Example City NC,Rising 9-12,2027;2028,$250,https://example.com/register,https://example-athletics.com/camps,2026,https://example-athletics.com/camps,official_university,no,,${EX}`,
  id_camp_appearances: `ACC_EXAMPLE_WSOC,,Example Showcase,Example Events,2026-12-05,Phoenix AZ,Showcase,https://example.com/showcase,https://example.com/showcase/coaches,external_event,no,,${EX}`,
  conference_history: `ACC_EXAMPLE_WSOC,Atlantic Sun Conference,2015,2025,https://example.com/conference,conference,no,,${EX}`,
};
/** Import kind -> template file name (id_camp_appearances / program_seasons are the user-facing names). */
export const TEMPLATE_FILE = { programs: 'programs', coaches: 'coaches', seasons: 'program_seasons', rankings: 'rankings', camps: 'camps', idcamps: 'id_camp_appearances', conference_history: 'conference_history' };
export const CSV_TEMPLATES = Object.fromEntries(Object.entries(TEMPLATE_FILE).map(([kind, file]) => [kind, TEMPLATE_HEADERS[file]]));
export const CSV_TEMPLATES_WITH_EXAMPLE = Object.fromEntries(Object.entries(TEMPLATE_FILE).map(([kind, file]) => [kind, `${TEMPLATE_HEADERS[file]}\n${TEMPLATE_EXAMPLES[file]}\n`]));
