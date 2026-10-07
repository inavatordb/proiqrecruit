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
export const RANKING_ORGS = ['United Soccer Coaches', 'NCAA', 'RPI', 'Massey', 'Other'];
export const RANKING_TYPES = ['preseason', 'weekly', 'final', 'highest'];
export const CONTACT_METHODS = ['email', 'phone', 'text', 'in_person', 'camp', 'social', 'other'];
export const PROFILE_PRIVACY = ['private', 'unlisted', 'public'];

export const PRIVATE_ENTITIES = ['RecruitPlayerProfile', 'RecruitTarget', 'RecruitNote', 'RecruitContact', 'RecruitActivity', 'RecruitCampTrack'];
export const CATALOG_ENTITIES = ['CollegeProgram', 'ProgramCoach', 'ProgramSeason', 'ProgramRanking', 'ProgramCamp', 'IDCampAppearance', 'DataSource', 'RecruitImport'];
export const RECRUITING_ENTITIES = new Set([...PRIVATE_ENTITIES, ...CATALOG_ENTITIES]);

export const KINDS = {
  programs: { entity: 'CollegeProgram', label: 'Programs' },
  coaches: { entity: 'ProgramCoach', label: 'Coaches' },
  seasons: { entity: 'ProgramSeason', label: 'Seasons' },
  rankings: { entity: 'ProgramRanking', label: 'Rankings' },
  camps: { entity: 'ProgramCamp', label: 'Camps' },
  idcamps: { entity: 'IDCampAppearance', label: 'ID Camp Appearances' },
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
export function toDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
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
export function parseCsv(input) {
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
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
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
const base = (row, id) => ({
  id,
  verification_status: normVerification(row.verification_status || (toBool(row.verified) ? 'verified' : ''), 'unverified'),
  source_url: safeUrl(row.source_url),
  source_name: str(row.source_name, 160),
  source_type: SOURCE_TYPES.includes(str(row.source_type)) ? str(row.source_type) : '',
  notes: text(row.notes, 2000),
});

/** Resolves a child row's program: program_id, else school_name (+optional sport/division). */
function programRef(row, ctx) {
  const p = ctx.resolveProgram(row);
  return p || null;
}

export const NORMALIZERS = {
  programs(row, ctx) {
    const errors = []; const warnings = [];
    const name = str(row.school_name || row.school || row.institution, 160);
    const sport = str(row.sport || DEFAULT_SPORT, 40).toLowerCase();
    const division = str(row.division || row.ncaa_division, 10).toUpperCase().replace(/^NCAA\s*/, '').replace(/^DIVISION\s*/, '').replace(/^III$/, 'D3').replace(/^II$/, 'D2').replace(/^I$/, 'D1');
    const divKey = /^D?[123]$/.test(division) ? `D${division.replace('D', '')}` : division;
    if (!name) errors.push('school_name is required');
    if (!SPORTS[sport]) errors.push(`unknown sport "${sport}"`);
    if (!DIVISIONS[divKey]) errors.push(`unknown division "${row.division || ''}" (use D1, D2, D3, NAIA or JUCO)`);
    if (errors.length) return { errors };
    const slug = ctx.programSlug(row, name, sport);
    const state = stateAbbr(row.state);
    if (!safeUrl(row.womens_soccer_url || row.program_url || row.team_website) && !safeUrl(row.athletics_website)) warnings.push('no athletics/program website');
    const record = {
      ...base(row, programIdFor(sport, slug)),
      slug, sport, division: divKey, governing_body: DIVISIONS[divKey].body,
      school_name: name,
      official_school_name: str(row.official_school_name, 200) || name,
      nickname: str(row.nickname, 80),
      conference: str(row.conference, 160),
      conference_slug: slugify(row.conference),
      city: str(row.city, 100), state, state_name: STATES[state]?.[0] || '',
      region: str(row.region, 30) || regionForState(state),
      school_website: safeUrl(row.school_website),
      athletics_website: safeUrl(row.athletics_website),
      team_website: safeUrl(row.team_website || row.womens_soccer_website || row.program_url),
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
    return { record, warnings };
  },

  coaches(row, ctx) {
    const prog = programRef(row, ctx);
    if (!prog) return { errors: ['program not found (give program_id, or school_name matching an existing program)'] };
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
    if (!prog) return { errors: ['program not found'] };
    const season = toInt(row.season);
    if (!season || season < 1990 || season > 2100) return { errors: ['season must be a year like 2025'] };
    const w = toInt(row.wins); const l = toInt(row.losses); const t = toInt(row.ties);
    const appears = row.ncaa_tournament_appearance === '' || row.ncaa_tournament_appearance == null ? undefined : toBool(row.ncaa_tournament_appearance);
    return {
      record: {
        ...base(row, `season_${shortHash(prog.id)}_${season}`),
        program_id: prog.id, sport: prog.sport, season, wins: w, losses: l, ties: t,
        winning_percentage: row.winning_percentage ? Number(row.winning_percentage) || winPct(w, l, t) : winPct(w, l, t),
        conference_record: str(row.conference_record, 30), conference_finish: str(row.conference_finish, 80),
        regular_season_finish: str(row.regular_season_finish, 80), conference_tournament_result: str(row.conference_tournament_result, 120),
        conference_champion: row.conference_champion === '' || row.conference_champion == null ? undefined : toBool(row.conference_champion),
        ncaa_tournament_appearance: appears,
        ncaa_tournament_round: str(row.ncaa_tournament_round, 60),
        postseason_result: str(row.postseason_result, 160),
        goals_for: toInt(row.goals_for), goals_against: toInt(row.goals_against),
      },
      warnings: [],
    };
  },

  rankings(row, ctx) {
    const prog = programRef(row, ctx);
    if (!prog) return { errors: ['program not found'] };
    const season = toInt(row.season);
    const rank = toInt(row.rank);
    if (!season) return { errors: ['season is required'] };
    if (!rank || rank < 1 || rank > 400) return { errors: ['rank must be a positive number'] };
    const org = RANKING_ORGS.find((o) => o.toLowerCase() === str(row.organization || row.ranking_organization).toLowerCase()) || 'Other';
    const type = RANKING_TYPES.includes(str(row.ranking_type).toLowerCase()) ? str(row.ranking_type).toLowerCase() : 'weekly';
    const date = toDate(row.ranking_date); const week = str(row.week, 20);
    return {
      record: {
        ...base(row, `rank_${shortHash(prog.id)}_${season}_${slugify(org)}_${type}_${date || week || 'x'}`),
        program_id: prog.id, sport: prog.sport, season, organization: org, ranking_type: type, rank, ranking_date: date, week,
      },
      warnings: [],
    };
  },

  camps(row, ctx) {
    const prog = programRef(row, ctx);
    if (!prog) return { errors: ['program not found'] };
    const name = str(row.camp_name || row.name, 200);
    const date = toDate(row.camp_date || row.start_date);
    if (!name) return { errors: ['camp_name is required'] };
    if (!date) return { errors: ['camp_date is required (YYYY-MM-DD)'] };
    const type = CAMP_TYPES.find((c) => c.toLowerCase() === str(row.camp_type).toLowerCase()) || 'Other';
    const contact = str(row.contact_email, 160).toLowerCase();
    const warnings = [];
    if (contact && (!isEmail(contact) || isPersonalEmail(contact))) warnings.push('contact_email dropped (malformed or personal webmail)');
    return {
      record: {
        ...base(row, `camp_${shortHash(prog.id)}_${date}_${slugify(name).slice(0, 40)}`),
        program_id: prog.id, sport: prog.sport, camp_name: name, camp_type: type, camp_date: date, end_date: toDate(row.end_date),
        year: Number(date.slice(0, 4)),
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
    if (!prog) return { errors: ['program not found'] };
    const name = str(row.event_name || row.name, 200);
    const date = toDate(row.event_date || row.date);
    if (!name) return { errors: ['event_name is required'] };
    if (!date) return { errors: ['event_date is required (YYYY-MM-DD)'] };
    return {
      record: {
        ...base(row, `idc_${shortHash(prog.id)}_${date}_${slugify(name).slice(0, 40)}`),
        program_id: prog.id, sport: prog.sport, coach_id: str(row.coach_id, 80), event_name: name,
        event_organization: str(row.event_organization || row.organizer, 160), event_date: date, year: Number(date.slice(0, 4)),
        location: str(row.location, 200), event_type: str(row.event_type, 80), registration_url: safeUrl(row.registration_url),
        advertised_school: str(row.advertised_school, 160), advertised_coach: str(row.advertised_coach, 160),
        official: false,
      },
      warnings: [],
    };
  },
};

/** Fields that never count as a "difference" when comparing an import row to a stored one. */
const META = new Set(['id', 'created_date', 'updated_date', 'last_verified_at', 'created_by', 'data_verified']);

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isBlank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Decide what an import row would do. Blank incoming values NEVER erase stored
 * ones, so layered imports (programs, then NCAA rounds, then records) compose.
 */
export function diffRecord(existing, incoming) {
  const changes = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (META.has(k) || k === 'verification_status' || isBlank(v)) continue;
    if (!sameValue(existing[k], v)) changes[k] = v;
  }
  return changes;
}

/**
 * Plan an import without touching the store.
 * ctx: { existing(id), resolveProgram(row), programSlug(row,name,sport) }
 */
export function planImport(kind, rows, ctx, { overwriteVerified = false } = {}) {
  const normalize = NORMALIZERS[kind];
  if (!normalize) throw new Error(`Unknown import kind "${kind}"`);
  const seen = new Set();
  const items = [];
  const summary = { found: rows.length, new: 0, updated: 0, duplicate: 0, errors: 0, review: 0 };
  rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    let res;
    try { res = normalize(row, ctx); } catch (e) { res = { errors: [String(e.message || e)] }; }
    if (res.errors?.length) {
      summary.errors++;
      items.push({ line, action: 'error', label: str(row.school_name || row.camp_name || row.event_name || `${row.first_name || ''} ${row.last_name || ''}`, 120), messages: res.errors });
      return;
    }
    const rec = res.record;
    const label = labelFor(kind, rec);
    if (seen.has(rec.id)) {
      summary.duplicate++;
      items.push({ line, action: 'duplicate', id: rec.id, label, messages: ['appears more than once in this file; later row ignored'] });
      return;
    }
    seen.add(rec.id);
    const messages = [...(res.warnings || [])];
    const prev = ctx.existing(rec.id);
    if (!prev) {
      summary.new++;
      if (messages.length) summary.review++;
      items.push({ line, action: 'new', id: rec.id, label, messages, record: rec, flagged: messages.length > 0 });
      return;
    }
    const changes = diffRecord(prev, rec);
    if (!Object.keys(changes).length) {
      summary.duplicate++;
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
    case 'programs': return `${r.school_name} (${r.division})`;
    case 'coaches': return `${r.first_name} ${r.last_name} — ${r.title || 'staff'}`;
    case 'seasons': return `${r.season} season`;
    case 'rankings': return `${r.season} ${r.organization} ${r.ranking_type} #${r.rank}`;
    case 'camps': return `${r.camp_name} (${r.camp_date})`;
    case 'idcamps': return `${r.event_name} (${r.event_date})`;
    default: return r.id;
  }
}

/* --------------------------------- templates -------------------------------- */
export const CSV_TEMPLATES = {
  programs: 'sport,division,school_name,official_school_name,nickname,conference,city,state,school_website,athletics_website,team_website,schedule_url,roster_url,camps_url,admissions_url,public_private,enrollment,source_url,source_name,notes',
  coaches: 'program_id,school_name,first_name,last_name,title,email,phone,bio_url,profile_url,years_at_program,previous_schools,source_url,verification_status',
  seasons: 'program_id,school_name,season,wins,losses,ties,conference_record,conference_finish,regular_season_finish,conference_tournament_result,conference_champion,ncaa_tournament_appearance,ncaa_tournament_round,postseason_result,goals_for,goals_against,source_url,verification_status',
  rankings: 'program_id,school_name,season,organization,ranking_type,rank,ranking_date,week,source_url,verification_status',
  camps: 'program_id,school_name,camp_name,camp_type,camp_date,end_date,registration_deadline,location,age_range,graduation_years,gender,cost,description,registration_url,official_camp_url,contact_email,contact_phone,source_url,verification_status',
  idcamps: 'program_id,school_name,event_name,event_organization,event_date,location,event_type,registration_url,advertised_school,advertised_coach,source_url,notes,verification_status',
};
