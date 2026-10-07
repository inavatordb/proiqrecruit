/**
 * Recruiting platform -- store-backed service.
 *
 * Everything here goes through the host's entity store (loadEntity /
 * persistEntity), never through the generic /api/e/ route, so private player
 * data can only ever leave through a function that checks ownership.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  KINDS, SPORTS, DIVISIONS, DEFAULT_SPORT, PIPELINE_KEYS, PROFILE_PRIVACY, CONTACT_METHODS, COACH_ROLE_ORDER, COACH_ROLE_LABEL, STATE_LIST, REGIONS,
  NORMALIZERS, planImport, parseCsvWithHeader, checkColumns, resolveSport, slugify, shortHash, str, text, safeUrl, toBool, toInt, toList, toDate, stateAbbr, regionForState,
  stateDistanceMiles, programIdFor, roundRank, currentYear, isCompletedSeason, normVerification, winPct, SOURCE_TYPES, CAMP_TYPES,
} from './core.mjs';

const newId = (p) => `${p}_${crypto.randomBytes(9).toString('hex')}`;
const today = (d = new Date()) => d.toISOString().slice(0, 10);

export function createRecruitingService({ loadEntity, persistEntity, now = () => new Date().toISOString(), seedDir }) {
  const rows = (name) => [...loadEntity(name).values()];
  const getRow = (name, id) => loadEntity(name).get(id) || null;
  const putRow = (name, rec, { quiet } = {}) => {
    loadEntity(name).set(rec.id, rec);
    persistEntity(name, quiet ? { skipPush: true } : undefined);
    if (!PRIVATE.has(name)) catalogVersion++;
    return rec;
  };
  const delRow = (name, id) => {
    const ok = loadEntity(name).delete(id);
    if (ok) { persistEntity(name); if (!PRIVATE.has(name)) catalogVersion++; }
    return ok;
  };
  const PRIVATE = new Set(['RecruitPlayerProfile', 'RecruitTarget', 'RecruitNote', 'RecruitContact', 'RecruitActivity', 'RecruitCampTrack']);
  let catalogVersion = 0;

  /* ------------------------------ catalog index ------------------------------ */
  let cached = null;
  function index() {
    if (cached && cached.v === catalogVersion) return cached;
    const group = (name) => {
      const m = new Map();
      for (const r of rows(name)) { if (!m.has(r.program_id)) m.set(r.program_id, []); m.get(r.program_id).push(r); }
      return m;
    };
    const programs = rows('CollegeProgram');
    const bySlug = new Map(); const byName = new Map();
    for (const p of programs) {
      bySlug.set(`${p.sport}:${p.slug}`, p);
      byName.set(`${p.sport}:${slugify(p.school_name)}`, p);
      if (!byName.has(`${p.sport}:${slugify(p.official_school_name)}`)) byName.set(`${p.sport}:${slugify(p.official_school_name)}`, p);
    }
    cached = {
      v: catalogVersion, programs, bySlug, byName,
      byId: new Map(programs.map((p) => [p.id, p])),
      coaches: group('ProgramCoach'), seasons: group('ProgramSeason'), rankings: group('ProgramRanking'),
      camps: group('ProgramCamp'), idcamps: group('IDCampAppearance'), confhist: group('ProgramConferenceHistory'),
      byCode: new Map(programs.filter((p) => p.program_code).map((p) => [String(p.program_code).toUpperCase(), p])),
    };
    return cached;
  }

  /* --------------------------------- sources --------------------------------- */
  function recordSource(entity, rec, extra = {}) {
    const url = safeUrl(extra.url || rec.source_url);
    if (!url) return null;
    const id = `src_${shortHash(`${entity}|${rec.id}|${url}`)}`;
    const prev = getRow('DataSource', id);
    const type = SOURCE_TYPES.includes(extra.type || rec.source_type) ? (extra.type || rec.source_type) : (/ncaa\.org/.test(url) ? 'NCAA' : 'Other verified public source');
    return putRow('DataSource', {
      ...(prev || {}), id, created_date: prev?.created_date || now(), updated_date: now(),
      entity_type: entity, entity_id: rec.id, program_id: rec.program_id || (entity === 'CollegeProgram' ? rec.id : ''),
      source_url: url, source_name: str(extra.name || rec.source_name || '', 160), source_type: type,
      accessed_at: extra.accessed_at || prev?.accessed_at || now(), last_verified_at: rec.last_verified_at || prev?.last_verified_at || '',
      information_extracted: str(extra.extracted || prev?.information_extracted || entity, 300),
      verification_status: rec.verification_status || 'unverified', notes: prev?.notes || '',
    });
  }

  function finalize(entity, rec, prev, origin) {
    const status = normVerification(rec.verification_status, prev?.verification_status || 'unverified');
    const out = {
      ...(prev || {}), ...rec,
      verification_status: status, data_verified: status === 'verified',
      last_verified_at: status === 'verified'
        ? (rec.last_verified_at || (prev?.verification_status === 'verified' && prev.last_verified_at ? prev.last_verified_at : now()))
        : (rec.last_verified_at || prev?.last_verified_at || ''),
      created_date: prev?.created_date || now(), updated_date: now(), origin: origin || prev?.origin || 'import',
    };
    // Layered imports: a blank incoming value never erases a stored one.
    if (prev) for (const k of Object.keys(out)) if ((out[k] === '' || out[k] == null || (Array.isArray(out[k]) && !out[k].length)) && prev[k] != null && prev[k] !== '') out[k] = prev[k];
    return out;
  }

  /* --------------------------------- imports --------------------------------- */
  function importCtx(kind) {
    const idx = index();
    const claimed = new Map();
    const entity = KINDS[kind].entity;
    const claimedCodes = new Map(); // program_code -> { id, name } claimed earlier in this same file
    return {
      existing: (id) => getRow(entity, id),
      /** Child rows: program_id is our program code (ACC_DUKE_WSOC) or internal id. school_name is used only when program_id is absent. */
      resolveProgram(row) {
        const pid = String(row.program_id || '').trim();
        if (pid) return idx.byId.get(pid) || idx.byCode.get(pid.toUpperCase()) || null;
        const sport = resolveSport(row.sport, row.gender) || DEFAULT_SPORT;
        const key = slugify(row.school_name || row.school || row.institution);
        return (key && (idx.bySlug.get(`${sport}:${key}`) || idx.byName.get(`${sport}:${key}`))) || null;
      },
      /** Program rows: internal id, then program code, then school name (same state) -- so a re-import updates, never duplicates. */
      findProgram(row) {
        if (row.internal_id && idx.byId.get(row.internal_id)) return idx.byId.get(row.internal_id);
        if (row.program_code && idx.byCode.get(row.program_code)) return idx.byCode.get(row.program_code);
        const key = slugify(row.school_name || row.school || row.institution);
        const hit = key && (idx.bySlug.get(`${row.sport}:${key}`) || idx.byName.get(`${row.sport}:${key}`));
        const st = stateAbbr(row.state);
        return hit && (!st || !hit.state || st === hit.state) ? hit : null;
      },
      /** Is this program code already taken by a DIFFERENT program (stored, or earlier in this file)? */
      codeOwner(code, id) {
        const owner = idx.byCode.get(code);
        if (owner && owner.id !== id) return owner.school_name;
        const by = claimedCodes.get(code);
        return by && by.id !== id ? by.name : null;
      },
      claimCode(code, id, name) { if (code) claimedCodes.set(code, { id, name }); },
      resolveCoach(programId, ref) {
        const want = slugify(ref);
        return (idx.coaches.get(programId) || []).find((c) => c.id === ref || slugify(`${c.first_name}-${c.last_name}`) === want) || null;
      },
      programSlug(row, name, sport) {
        if (row.slug) return slugify(row.slug);
        const base = slugify(name);
        const st = stateAbbr(row.state) || 'xx';
        const id = programIdFor(sport, base);
        const owner = getRow('CollegeProgram', id) || claimed.get(id);
        const mine = (o) => !o || stateAbbr(o.state) === st;
        const slug = mine(owner) ? base : `${base}-${st.toLowerCase()}`;
        claimed.set(programIdFor(sport, slug), { state: st });
        return slug;
      },
    };
  }

  const ALLOWED_KIND = (k) => Object.prototype.hasOwnProperty.call(KINDS, k) && NORMALIZERS[k];
  const COLLECTION = (k) => Object.prototype.hasOwnProperty.call(KINDS, k);

  function previewImport(kind, csv, opts = {}) {
    if (!ALLOWED_KIND(kind)) throw httpErr(400, 'Unknown import kind.');
    const { header, rows: parsed } = parseCsvWithHeader(csv);
    if (!parsed.length) throw httpErr(400, 'The CSV is empty or has no data rows.');
    if (parsed.length > 20000) throw httpErr(400, 'Too many rows (limit 20,000 per file).');
    const columns = checkColumns(kind, header);
    if (columns.blocked) {
      return { kind, columns, blocked: true, items: [], summary: { found: parsed.length, new: 0, updated: 0, skipped: 0, duplicate: 0, errors: 0, review: 0, warnings: 0, missing_email: 0, example: 0 } };
    }
    return { ...planImport(kind, parsed, importCtx(kind), opts), columns, blocked: false };
  }

  /** Applies a plan and writes an import_runs record. */
  function commitImport(kind, csv, { overwriteVerified = false, actor = 'admin', filename = '', origin = 'import', applyActions = ['new', 'update'] } = {}) {
    const startedAt = now();
    const plan = previewImport(kind, csv, { overwriteVerified });
    if (plan.blocked) throw httpErr(400, `Column check failed: missing ${plan.columns.missing.join('; ')}. Nothing was imported.`);
    const entity = KINDS[kind].entity;
    const applied = { new: 0, updated: 0 };
    for (const item of plan.items) {
      if (!item.record) continue;
      const act = item.action === 'review' && overwriteVerified ? 'update' : item.action;
      if (!applyActions.includes(act) && !(overwriteVerified && item.action === 'review')) continue;
      const prev = getRow(entity, item.id);
      const rec = finalize(entity, item.record, prev, origin);
      putRow(entity, rec);
      recordSource(entity, rec, { extracted: `${KINDS[kind].label} import${filename ? ` (${filename})` : ''}` });
      if (prev) applied.updated++; else applied.new++;
    }
    const s = plan.summary;
    const log = putRow('RecruitImport', {
      id: newId('imp'), created_date: startedAt, updated_date: now(), kind, import_type: kind, entity, filename: str(filename, 160), actor: str(actor, 160), user: str(actor, 160),
      started_at: startedAt, completed_at: now(),
      inserted: applied.new, updated: applied.updated, skipped: s.skipped, errors: s.errors, review: s.review, warnings: s.warnings, missing_email: s.missing_email,
      status: s.errors || s.review ? 'completed_with_issues' : 'completed',
      summary: plan.summary, applied, committed: true,
      problems: plan.items.filter((i) => i.action === 'error' || i.action === 'review' || i.flagged).slice(0, 200).map((i) => ({ line: i.line, action: i.action, label: i.label, messages: i.messages })),
    });
    return { plan: slimPlan(plan), applied, importId: log.id };
  }

  const slimPlan = (plan) => ({
    kind: plan.kind, summary: plan.summary, columns: plan.columns, blocked: !!plan.blocked,
    items: plan.items.slice(0, 1500).map(({ record, proposed, ...rest }) => rest),
    truncated: plan.items.length > 1500,
  });

  function previewImportSlim(kind, csv, opts) { return slimPlan(previewImport(kind, csv, opts)); }

  /** Loads bundled seed CSVs. Only touches records it created itself and nobody has edited. */
  function bootstrap() {
    if (!seedDir || !fs.existsSync(seedDir)) return { loaded: [] };
    const order = ['programs', 'conference_history', 'coaches', 'seasons', 'rankings', 'camps', 'idcamps'];
    const files = fs.readdirSync(seedDir).filter((f) => f.endsWith('.csv'))
      .map((f) => ({ f, kind: f.split('-')[0] })).filter((x) => order.includes(x.kind))
      // Base lists (programs-d1, programs-d2) first so later files only ever add to existing programs.
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || Number(/^[a-z_]+-d\d/.test(b.f)) - Number(/^[a-z_]+-d\d/.test(a.f)) || a.f.localeCompare(b.f));
    const loaded = [];
    for (const { f, kind } of files) {
      const csv = fs.readFileSync(path.join(seedDir, f), 'utf8');
      if (!csv.trim()) continue;
      let plan;
      try { plan = previewImport(kind, csv, { ignoreProvenance: true }); } catch (e) { console.error(`[recruiting] seed ${f} skipped: ${e.message}`); continue; }
      let n = 0;
      for (const item of plan.items) {
        if (!item.record) continue;
        const prev = getRow(KINDS[kind].entity, item.id);
        if (prev && !(item.action === 'update' && prev.origin === 'seed' && prev.verification_status !== 'verified')) continue;
        const rec = finalize(KINDS[kind].entity, item.record, prev, 'seed');
        putRow(KINDS[kind].entity, rec, { quiet: false });
        recordSource(KINDS[kind].entity, rec, { extracted: `Bundled seed ${f}` });
        n++;
      }
      if (n) loaded.push({ file: f, written: n });
    }
    return { loaded };
  }

  /* ----------------------------- program summaries ---------------------------- */
  const fmtRecord = (s) => (s.wins == null ? '' : `${s.wins}-${s.losses ?? 0}${s.ties != null ? `-${s.ties}` : ''}`);

  function bestRanking(rks) {
    let best = null;
    for (const r of rks) if (!best || r.rank < best.rank) best = r;
    return best ? { rank: best.rank, season: best.season, organization: best.organization, ranking_type: best.ranking_type, source_url: best.source_url } : null;
  }

  function summarize(p, idx = index(), { forAdmin = false } = {}) {
    const seasons = (idx.seasons.get(p.id) || []).filter((s) => s.verification_status !== 'archived');
    const completed = seasons.filter((s) => isCompletedSeason(s.season)).sort((a, b) => b.season - a.season).slice(0, 3);
    const rks = idx.rankings.get(p.id) || [];
    const coaches = (idx.coaches.get(p.id) || []).filter((c) => c.active !== false && c.verification_status !== 'archived');
    const camps = (idx.camps.get(p.id) || []).filter((c) => c.verification_status !== 'archived');
    const ids = (idx.idcamps.get(p.id) || []).filter((c) => c.verification_status !== 'archived');
    const t = today(); const year = currentYear();
    const upcoming = camps.filter((c) => (c.end_date || c.camp_date) >= t).sort((a, b) => a.camp_date.localeCompare(b.camp_date));
    const head = coaches.find((c) => c.role === 'head');
    const recentYears = completed.map((s) => s.season);
    return {
      id: p.id, slug: p.slug, sport: p.sport, division: p.division, school_name: p.school_name, official_school_name: p.official_school_name,
      nickname: p.nickname, conference: p.conference, city: p.city, state: p.state, region: p.region, logo_url: p.logo_url,
      public_private: p.public_private, verification_status: p.verification_status, active: p.active !== false,
      recent_seasons: completed.map((s) => ({ season: s.season, record: fmtRecord(s), wins: s.wins, losses: s.losses, ties: s.ties, ncaa: s.ncaa_tournament_appearance ?? null, ncaa_round: s.ncaa_tournament_round || '', conference_champion: s.conference_champion ?? null })),
      best_ranking: bestRanking(rks),
      winning_recent: completed.length ? (completed[0].wins != null ? (winPct(completed[0].wins, completed[0].losses, completed[0].ties) ?? 0) > 0.5 : null) : null,
      conference_champion_recent: completed.some((s) => s.conference_champion === true),
      ncaa_recent: completed.some((s) => s.ncaa_tournament_appearance === true),
      ncaa_best_round_rank: Math.max(0, ...completed.map((s) => roundRank(s.ncaa_tournament_round))),
      ranked_recent: rks.some((r) => recentYears.includes(r.season)),
      coach_count: coaches.length,
      head_coach: head ? { name: `${head.first_name} ${head.last_name}`, email: head.email || '' } : null,
      has_coach_email: coaches.some((c) => !!c.email),
      has_recruiting_coordinator: coaches.some((c) => c.role === 'recruiting_coordinator' || /recruit/i.test(c.title || '')),
      camps_current_count: camps.filter((c) => c.year === year).length,
      has_id_camps: camps.some((c) => /\bID\b|prospect/i.test(`${c.camp_type} ${c.camp_name}`) && c.year >= year - 1),
      upcoming_camp_count: upcoming.length,
      next_camp: upcoming[0] ? { id: upcoming[0].id, camp_name: upcoming[0].camp_name, camp_date: upcoming[0].camp_date, camp_type: upcoming[0].camp_type, verified: upcoming[0].verification_status === 'verified' } : null,
      recent_id_events: ids.filter((e) => e.event_date >= `${year - 1}-${t.slice(5)}`).length,
      gpa_expectation: p.gpa_expectation || '', academic_programs: p.academic_programs || [],
      ...(forAdmin ? { updated_date: p.updated_date } : {}),
    };
  }

  /* ---------------------------------- search ---------------------------------- */
  const csvParam = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

  function search(q = {}, { admin = false } = {}) {
    const idx = index();
    const divs = csvParam(q.division).map((d) => d.toUpperCase());
    const states = csvParam(q.state).map(stateAbbr);
    const regions = csvParam(q.region);
    const confs = csvParam(q.conference);
    const sport = str(q.sport || DEFAULT_SPORT, 40);
    const needle = str(q.q, 80).toLowerCase();
    const acad = str(q.academic, 80).toLowerCase();
    const flag = (k) => q[k] === '1' || q[k] === 'true';
    const topN = toInt(q.top);
    const minRound = roundRank(q.ncaa_round);
    const maxDist = toInt(q.max_distance);
    const fromState = stateAbbr(q.from_state);

    let list = [];
    for (const p of idx.programs) {
      if (!admin && (p.active === false || p.verification_status === 'archived')) continue;
      if (sport !== 'all' && p.sport !== sport) continue;
      if (divs.length && !divs.includes(p.division)) continue;
      if (states.length && !states.includes(p.state)) continue;
      if (regions.length && !regions.includes(p.region)) continue;
      if (confs.length && !confs.includes(p.conference)) continue;
      if (needle && !`${p.school_name} ${p.official_school_name} ${p.nickname} ${p.city} ${p.state_name} ${p.conference}`.toLowerCase().includes(needle)) continue;
      if (acad && !`${(p.academic_programs || []).join(' ')} ${p.academic_info || ''}`.toLowerCase().includes(acad)) continue;
      const s = summarize(p, idx);
      if (flag('winning') && s.winning_recent !== true) continue;
      if (flag('champion') && !s.conference_champion_recent) continue;
      if (flag('ncaa') && !s.ncaa_recent) continue;
      if (minRound && s.ncaa_best_round_rank < minRound) continue;
      if (flag('ranked') && !s.ranked_recent) continue;
      if (topN && !(s.best_ranking && s.best_ranking.rank <= topN)) continue;
      if (flag('has_id_camp') && !s.has_id_camps) continue;
      if (flag('upcoming_camps') && !s.upcoming_camp_count) continue;
      if (flag('recent_id') && !s.recent_id_events) continue;
      if (flag('coach_contact') && !s.has_coach_email) continue;
      if (flag('recruiting_coordinator') && !s.has_recruiting_coordinator) continue;
      if (fromState) s.distance_miles = stateDistanceMiles(fromState, p.state);
      if (maxDist && fromState && !(s.distance_miles != null && s.distance_miles <= maxDist)) continue;
      list.push(s);
    }
    const sort = str(q.sort || 'name', 20);
    const cmp = {
      name: (a, b) => a.school_name.localeCompare(b.school_name),
      ranking: (a, b) => (a.best_ranking?.rank ?? 9999) - (b.best_ranking?.rank ?? 9999) || a.school_name.localeCompare(b.school_name),
      distance: (a, b) => (a.distance_miles ?? 99999) - (b.distance_miles ?? 99999) || a.school_name.localeCompare(b.school_name),
      record: (a, b) => (b.recent_seasons[0]?.wins ?? -1) - (a.recent_seasons[0]?.wins ?? -1) || a.school_name.localeCompare(b.school_name),
    }[sort] || ((a, b) => a.school_name.localeCompare(b.school_name));
    list.sort(cmp);
    const total = list.length;
    const limit = Math.min(Math.max(toInt(q.limit) || 24, 1), 100);
    const page = Math.max(toInt(q.page) || 1, 1);
    return { total, page, limit, results: list.slice((page - 1) * limit, page * limit) };
  }

  /* ---------------------------------- detail ---------------------------------- */
  function rankingHistory(rks) {
    const bySeason = new Map();
    for (const r of rks) {
      if (r.verification_status === 'archived') continue;
      if (!bySeason.has(r.season)) bySeason.set(r.season, new Map());
      const orgs = bySeason.get(r.season);
      if (!orgs.has(r.organization)) orgs.set(r.organization, []);
      orgs.get(r.organization).push(r);
    }
    return [...bySeason.entries()].sort((a, b) => b[0] - a[0]).map(([season, orgs]) => ({
      season,
      organizations: [...orgs.entries()].map(([organization, list]) => {
        const final = list.filter((r) => r.ranking_type === 'final').sort((a, b) => (b.ranking_date || '').localeCompare(a.ranking_date || ''))[0];
        const pre = list.find((r) => r.ranking_type === 'preseason');
        const hi = list.reduce((m, r) => (r.rank < m.rank ? r : m), list[0]);
        return {
          organization, highest: hi.rank, final: final?.rank ?? null, preseason: pre?.rank ?? null,
          weeks: list.filter((r) => r.ranking_type === 'weekly').length,
          source_urls: [...new Set(list.map((r) => r.source_url).filter(Boolean))].slice(0, 3),
          verified: list.every((r) => r.verification_status === 'verified'),
        };
      }),
    }));
  }

  function detail(slug, { sport = DEFAULT_SPORT, admin = false } = {}) {
    const idx = index();
    const p = idx.bySlug.get(`${sport}:${slug}`);
    if (!p || (!admin && (p.active === false || p.verification_status === 'archived'))) return null;
    const hide = (r) => admin || r.verification_status !== 'archived';
    const coaches = (idx.coaches.get(p.id) || []).filter((c) => hide(c) && (admin || c.active !== false))
      .sort((a, b) => COACH_ROLE_ORDER.indexOf(a.role) - COACH_ROLE_ORDER.indexOf(b.role) || a.last_name.localeCompare(b.last_name))
      .map((c) => ({ ...c, role_label: COACH_ROLE_LABEL[c.role] || 'Staff', email_listed: !!c.email }));
    const history = (idx.confhist.get(p.id) || []).filter(hide)
      .sort((a, b) => (b.start_season ?? 0) - (a.start_season ?? 0) || (b.end_season ?? 9999) - (a.end_season ?? 9999));
    // Conference in a given season comes from history (never assumed from today's conference) -- except the current season.
    const confIn = (season) => {
      const h = history.find((r) => (r.start_season == null || r.start_season <= season) && (r.end_season == null || season <= r.end_season));
      return h ? h.conference : '';
    };
    const seasons = (idx.seasons.get(p.id) || []).filter(hide).sort((a, b) => b.season - a.season)
      .map((s) => ({ ...s, record: fmtRecord(s), completed: isCompletedSeason(s.season), is_current_season: s.season >= currentYear(), conference_that_season: s.conference || confIn(s.season) || (s.season >= currentYear() ? p.conference : '') }));
    const recentCompleted = seasons.filter((s) => s.completed).slice(0, 3).map((s) => s.season);
    const year = currentYear();
    const camps = (idx.camps.get(p.id) || []).filter(hide).sort((a, b) => a.camp_date.localeCompare(b.camp_date)).map((c) => ({ ...c, upcoming: (c.end_date || c.camp_date) >= today() }));
    const ids = (idx.idcamps.get(p.id) || []).filter(hide).sort((a, b) => b.event_date.localeCompare(a.event_date)).map((e) => ({ ...e, upcoming: e.event_date >= today() }));
    const sources = rows('DataSource').filter((s) => s.program_id === p.id);
    const publicSources = [...new Map(sources.map((s) => [s.source_url, { source_url: s.source_url, source_name: s.source_name, source_type: s.source_type, last_verified_at: s.last_verified_at }])).values()];
    return {
      program: { ...p, division_label: DIVISIONS[p.division]?.label || p.division, sport_label: SPORTS[p.sport]?.label || p.sport },
      summary: summarize(p, idx),
      coaches,
      seasons,
      conference_history: history,
      current_season: seasons.find((s) => s.is_current_season) || null,
      recent_season_years: recentCompleted,
      rankings: rankingHistory(idx.rankings.get(p.id) || []),
      camps: { current_year: year, previous_year: year - 1, current: camps.filter((c) => c.year === year), previous: camps.filter((c) => c.year === year - 1) },
      id_appearances: { upcoming: ids.filter((e) => e.upcoming).reverse(), recent: ids.filter((e) => !e.upcoming) },
      sources: admin ? sources.sort((a, b) => (b.updated_date || '').localeCompare(a.updated_date || '')) : publicSources,
    };
  }

  /* ------------------------------- camps (public) ------------------------------- */
  function listCamps(q = {}) {
    const idx = index();
    const t = today();
    const states = csvParam(q.state).map(stateAbbr);
    const out = [];
    for (const c of rows('ProgramCamp')) {
      if (c.verification_status === 'archived') continue;
      const p = idx.byId.get(c.program_id); if (!p || p.active === false) continue;
      if (q.program && c.program_id !== q.program && p.slug !== q.program) continue;
      if (q.division && !csvParam(q.division).includes(p.division)) continue;
      if (states.length && !states.includes(p.state)) continue;
      if (q.year && c.year !== toInt(q.year)) continue;
      if (q.when === 'upcoming' && (c.end_date || c.camp_date) < t) continue;
      if (q.when === 'past' && (c.end_date || c.camp_date) >= t) continue;
      if (q.type && c.camp_type !== q.type) continue;
      if (q.ids && !csvParam(q.ids).includes(c.program_id)) continue;
      out.push({ ...c, upcoming: (c.end_date || c.camp_date) >= t, program: { id: p.id, slug: p.slug, school_name: p.school_name, division: p.division, conference: p.conference, state: p.state, logo_url: p.logo_url } });
    }
    out.sort((a, b) => (q.when === 'past' ? b.camp_date.localeCompare(a.camp_date) : a.camp_date.localeCompare(b.camp_date)));
    const limit = Math.min(Math.max(toInt(q.limit) || 40, 1), 200);
    return { total: out.length, results: out.slice(0, limit) };
  }

  function campDetail(id) {
    const c = getRow('ProgramCamp', id); if (!c || c.verification_status === 'archived') return null;
    const p = index().byId.get(c.program_id);
    return { ...c, upcoming: (c.end_date || c.camp_date) >= today(), program: p ? { id: p.id, slug: p.slug, school_name: p.school_name, division: p.division, conference: p.conference, state: p.state } : null };
  }

  function meta() {
    const idx = index();
    const confs = {};
    for (const p of idx.programs) {
      if (p.active === false || p.verification_status === 'archived' || !p.conference) continue;
      const k = `${p.division}|${p.conference}`; confs[k] = (confs[k] || 0) + 1;
    }
    return {
      sports: Object.entries(SPORTS).map(([id, s]) => ({ id, ...s })),
      divisions: Object.entries(DIVISIONS).map(([id, d]) => ({ id, ...d, count: idx.programs.filter((p) => p.division === id && p.active !== false && p.verification_status !== 'archived').length })),
      regions: REGIONS, states: STATE_LIST,
      conferences: Object.entries(confs).map(([k, count]) => { const [division, name] = k.split('|'); return { division, name, count }; }).sort((a, b) => a.name.localeCompare(b.name)),
      pipeline_stages: PIPELINE_KEYS, camp_types: CAMP_TYPES, current_year: currentYear(),
    };
  }

  /* ------------------------------------ admin ------------------------------------ */
  function stats() {
    const idx = index();
    const all = [];
    for (const k of Object.keys(KINDS)) if (k !== 'sources') all.push(...rows(KINDS[k].entity));
    const status = (s) => all.filter((r) => r.verification_status === s).length;
    return {
      programs_by_division: Object.fromEntries(Object.keys(DIVISIONS).map((d) => [d, idx.programs.filter((p) => p.division === d && p.active !== false).length])),
      programs: idx.programs.length,
      coaches: rows('ProgramCoach').length, seasons: rows('ProgramSeason').length, rankings: rows('ProgramRanking').length,
      camps: rows('ProgramCamp').length, id_events: rows('IDCampAppearance').length, sources: rows('DataSource').length,
      verified: status('verified'), needs_verification: status('unverified') + status('needs_review'),
      by_status: { verified: status('verified'), needs_review: status('needs_review'), unverified: status('unverified'), historical: status('historical'), archived: status('archived') },
      players: rows('RecruitPlayerProfile').length, imports: rows('RecruitImport').length,
      programs_without_coaches: idx.programs.filter((p) => p.active !== false && !(idx.coaches.get(p.id) || []).length).length,
      programs_without_seasons: idx.programs.filter((p) => p.active !== false && !(idx.seasons.get(p.id) || []).length).length,
      programs_without_camps: idx.programs.filter((p) => p.active !== false && !(idx.camps.get(p.id) || []).length).length,
    };
  }

  function adminList(kind, q = {}) {
    if (!COLLECTION(kind)) throw httpErr(404, 'Unknown collection.');
    const idx = index();
    const needle = str(q.q, 80).toLowerCase();
    let list = rows(KINDS[kind].entity);
    if (q.program) list = list.filter((r) => (kind === 'programs' ? r.id === q.program : r.program_id === q.program));
    if (q.status) list = list.filter((r) => r.verification_status === q.status);
    if (q.division && kind === 'programs') list = list.filter((r) => r.division === q.division);
    const withProgram = (r) => {
      const p = idx.byId.get(r.program_id);
      return p ? { ...r, program_name: p.school_name, program_slug: p.slug, program_division: p.division } : r;
    };
    list = list.map(kind === 'programs' ? (r) => r : withProgram);
    if (needle) list = list.filter((r) => JSON.stringify([r.school_name, r.program_name, r.first_name, r.last_name, r.camp_name, r.event_name, r.conference, r.season, r.source_url, r.entity_type]).toLowerCase().includes(needle));
    list.sort((a, b) => (b.updated_date || '').localeCompare(a.updated_date || ''));
    const limit = Math.min(Math.max(toInt(q.limit) || 50, 1), 200);
    const page = Math.max(toInt(q.page) || 1, 1);
    return { total: list.length, page, limit, results: list.slice((page - 1) * limit, page * limit) };
  }

  function adminSave(kind, body, id, actor) {
    if (!ALLOWED_KIND(kind)) throw httpErr(404, 'Unknown collection.');
    const entity = KINDS[kind].entity;
    const prev = id ? getRow(entity, id) : null;
    if (id && !prev) throw httpErr(404, 'Record not found.');
    const ctx = importCtx(kind);
    const input = { ...(prev || {}), ...body };
    for (const k of ['array_placeholder']) delete input[k];
    if (prev && kind === 'programs') input.slug = prev.slug;
    if (kind === 'programs') input.program_id = body.program_code ?? prev?.program_code ?? prev?.id ?? '';
    const res = NORMALIZERS[kind](input, ctx);
    if (res.errors?.length) throw httpErr(400, res.errors.join('; '));
    // Admin edits must be able to blank a field, which finalize() would otherwise refuse.
    const rec = { ...res.record, id: prev ? prev.id : res.record.id };
    if (!prev && getRow(entity, rec.id)) throw httpErr(409, 'A record with the same key already exists.');
    const saved = finalize(entity, { ...rec, verification_status: body.verification_status ?? prev?.verification_status ?? 'needs_review' }, null, 'admin');
    const out = { ...saved, created_date: prev?.created_date || saved.created_date, last_verified_at: saved.verification_status === 'verified' ? (prev?.verification_status === 'verified' && prev.last_verified_at ? prev.last_verified_at : now()) : (prev?.last_verified_at || ''), edited_by: str(actor, 160) };
    putRow(entity, out);
    recordSource(entity, out, { extracted: 'Admin edit' });
    return out;
  }

  function adminSetStatus(kind, id, status, actor) {
    if (!COLLECTION(kind)) throw httpErr(404, 'Unknown collection.');
    const entity = KINDS[kind].entity;
    const prev = getRow(entity, id); if (!prev) throw httpErr(404, 'Record not found.');
    const s = normVerification(status, '');
    if (!s) throw httpErr(400, 'Invalid status.');
    const out = { ...prev, verification_status: s, data_verified: s === 'verified', last_verified_at: s === 'verified' ? now() : prev.last_verified_at || '', updated_date: now(), edited_by: str(actor, 160), origin: 'admin' };
    putRow(entity, out);
    for (const src of rows('DataSource').filter((x) => x.entity_id === id)) putRow('DataSource', { ...src, verification_status: s, last_verified_at: out.last_verified_at });
    return out;
  }

  function adminDelete(kind, id) {
    if (!COLLECTION(kind)) throw httpErr(404, 'Unknown collection.');
    const entity = KINDS[kind].entity;
    if (!getRow(entity, id)) throw httpErr(404, 'Record not found.');
    if (kind === 'programs') {
      const used = rows('RecruitTarget').filter((t) => t.program_id === id).length;
      if (used) throw httpErr(409, `${used} player list(s) include this program. Archive it instead of deleting.`);
      for (const k of ['coaches', 'seasons', 'rankings', 'camps', 'idcamps', 'conference_history']) for (const r of rows(KINDS[k].entity).filter((x) => x.program_id === id)) delRow(KINDS[k].entity, r.id);
      // Players' leftover notes / contacts / camp plans for this school (their target was already removed).
      for (const name of ['RecruitNote', 'RecruitContact', 'RecruitCampTrack', 'RecruitActivity']) for (const r of rows(name).filter((x) => x.program_id === id)) delRow(name, r.id);
    }
    for (const s of rows('DataSource').filter((x) => x.entity_id === id)) delRow('DataSource', s.id);
    return delRow(entity, id);
  }

  function adminSourceNote(id, patch) {
    const prev = getRow('DataSource', id); if (!prev) throw httpErr(404, 'Source not found.');
    return putRow('DataSource', { ...prev, notes: text(patch.notes ?? prev.notes, 1000), source_type: SOURCE_TYPES.includes(patch.source_type) ? patch.source_type : prev.source_type, updated_date: now() });
  }

  /* -------------------------------- player: profile -------------------------------- */
  const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'WB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'];

  function profileFor(user, { create = true } = {}) {
    let p = rows('RecruitPlayerProfile').find((x) => x.owner_user_id === user.id);
    if (!p && create) {
      p = putRow('RecruitPlayerProfile', {
        id: newId('rpp'), created_date: now(), updated_date: now(), owner_user_id: user.id, account_role: 'player_family',
        guardian_user_ids: [], sport: DEFAULT_SPORT, first_name: '', last_name: '', email: user.email || '', privacy: 'private',
        share_token: crypto.randomBytes(12).toString('hex'), slug: '', onboarded: false,
      });
    }
    return p || null;
  }

  /** Hook for the later parent/guardian feature: only the owner (and listed guardians) may act on a profile. */
  const canAct = (user, profile) => !!profile && (profile.owner_user_id === user.id || (profile.guardian_user_ids || []).includes(user.id));

  function saveProfile(user, body) {
    const p = profileFor(user);
    const pos = toList(body.positions).map((x) => x.toUpperCase()).filter((x) => POSITIONS.includes(x));
    const privacy = PROFILE_PRIVACY.includes(body.privacy) ? body.privacy : p.privacy;
    const next = {
      ...p,
      first_name: str(body.first_name, 60), last_name: str(body.last_name, 60),
      display_name: str(body.display_name, 80),
      grad_year: toInt(body.grad_year), positions: pos, primary_position: POSITIONS.includes(String(body.primary_position || '').toUpperCase()) ? String(body.primary_position).toUpperCase() : (pos[0] || ''),
      height: str(body.height, 20), club: str(body.club, 120), high_school: str(body.high_school, 120),
      state: stateAbbr(body.state), city: str(body.city, 80), gpa: body.gpa === '' || body.gpa == null ? null : Math.min(Math.max(Number(body.gpa) || 0, 0), 5),
      academic_interests: toList(body.academic_interests), preferred_regions: toList(body.preferred_regions).filter((r) => REGIONS.includes(r)),
      recruiting_status: ['exploring', 'actively_recruiting', 'committed', 'not_recruiting'].includes(body.recruiting_status) ? body.recruiting_status : (p.recruiting_status || 'exploring'),
      highlight_links: (Array.isArray(body.highlight_links) ? body.highlight_links : toList(body.highlight_links)).map(safeUrl).filter(Boolean).slice(0, 10),
      bio: text(body.bio, 2000),
      // Private contact + guardian details. NEVER copied into any public view.
      email: str(body.email, 160), phone: str(body.phone, 40),
      guardian_name: str(body.guardian_name, 120), guardian_email: str(body.guardian_email, 160), guardian_phone: str(body.guardian_phone, 40),
      privacy,
      share_list: toBool(body.share_list), public_show_gpa: toBool(body.public_show_gpa), public_show_club: body.public_show_club === undefined ? p.public_show_club !== false : toBool(body.public_show_club),
      onboarded: true, updated_date: now(),
    };
    if (!next.slug || next.display_name !== p.display_name || next.first_name !== p.first_name) {
      const base = slugify(next.display_name || `${next.first_name} ${next.last_name.slice(0, 1)}`) || 'player';
      next.slug = `${base}-${(p.share_token || '').slice(0, 4)}`;
    }
    return putRow('RecruitPlayerProfile', next);
  }

  function rotateShareToken(user) {
    const p = profileFor(user);
    return putRow('RecruitPlayerProfile', { ...p, share_token: crypto.randomBytes(12).toString('hex'), updated_date: now() });
  }

  /** What the world may see of a profile. Contact + guardian data is structurally absent. */
  function publicProfileView(p, withList) {
    const name = p.display_name || [p.first_name, (p.last_name || '').slice(0, 1) && `${p.last_name.slice(0, 1)}.`].filter(Boolean).join(' ') || 'Player';
    const idx = index();
    const out = {
      slug: p.slug, name, grad_year: p.grad_year || null, positions: p.positions || [], primary_position: p.primary_position || '', height: p.height || '',
      club: p.public_show_club === false ? '' : p.club || '', high_school: p.high_school || '', state: p.state || '',
      gpa: p.public_show_gpa ? p.gpa : null, academic_interests: p.academic_interests || [], highlight_links: p.highlight_links || [], bio: p.bio || '',
      recruiting_status: p.recruiting_status || 'exploring', privacy: p.privacy, sport: p.sport,
    };
    if (withList && p.share_list) {
      out.target_schools = rows('RecruitTarget').filter((t) => t.profile_id === p.id && t.stage !== 'not_pursuing').map((t) => idx.byId.get(t.program_id)).filter(Boolean)
        .map((pr) => ({ slug: pr.slug, school_name: pr.school_name, division: pr.division, conference: pr.conference, state: pr.state })).sort((a, b) => a.school_name.localeCompare(b.school_name));
    }
    return out;
  }

  function sharedProfile(slug, token) {
    const p = rows('RecruitPlayerProfile').find((x) => x.slug === slug);
    if (!p || !p.onboarded || p.privacy === 'private') return null;
    if (p.privacy === 'unlisted' && (!token || token !== p.share_token)) return null;
    return publicProfileView(p, true);
  }

  function sharedList(token) {
    if (!token) return null;
    const p = rows('RecruitPlayerProfile').find((x) => x.share_token === token && x.share_list && x.privacy !== 'private');
    if (!p) return null;
    return publicProfileView(p, true);
  }

  /* -------------------------------- player: targets -------------------------------- */
  function logActivity(profile, type, program, detail = '') {
    return putRow('RecruitActivity', { id: newId('rac'), created_date: now(), updated_date: now(), profile_id: profile.id, type, program_id: program?.id || '', school_name: program?.school_name || '', detail: str(detail, 200) }, { quiet: true });
  }

  function myTarget(profile, targetId) {
    const t = getRow('RecruitTarget', targetId);
    return t && t.profile_id === profile.id ? t : null;
  }

  function addTarget(user, programId, stage = 'interested') {
    const profile = profileFor(user);
    const idx = index();
    const program = idx.byId.get(programId);
    if (!program) throw httpErr(404, 'Program not found.');
    const existing = rows('RecruitTarget').find((t) => t.profile_id === profile.id && t.program_id === programId);
    if (existing) return existing;
    const mine = rows('RecruitTarget').filter((t) => t.profile_id === profile.id);
    if (mine.length >= 300) throw httpErr(400, 'Your list is full (300 schools).');
    const t = putRow('RecruitTarget', {
      id: newId('rtg'), created_date: now(), updated_date: now(), profile_id: profile.id, program_id: programId,
      stage: PIPELINE_KEYS.includes(stage) ? stage : 'interested', tier: '', order: mine.length,
    });
    logActivity(profile, 'added_school', program);
    return t;
  }

  function updateTarget(user, targetId, patch) {
    const profile = profileFor(user, { create: false });
    const t = profile && myTarget(profile, targetId);
    if (!t) throw httpErr(404, 'Not found.');
    const next = { ...t, updated_date: now() };
    if (patch.stage && PIPELINE_KEYS.includes(patch.stage) && patch.stage !== t.stage) {
      next.stage = patch.stage;
      logActivity(profile, 'stage_changed', index().byId.get(t.program_id), `${t.stage} → ${patch.stage}`);
    }
    if (patch.tier !== undefined) next.tier = ['', 'reach', 'target', 'likely'].includes(patch.tier) ? patch.tier : t.tier;
    if (patch.order !== undefined && Number.isFinite(Number(patch.order))) next.order = Number(patch.order);
    return putRow('RecruitTarget', next);
  }

  function removeTarget(user, targetId) {
    const profile = profileFor(user, { create: false });
    const t = profile && myTarget(profile, targetId);
    if (!t) throw httpErr(404, 'Not found.');
    // Notes and contact history belong to the school record; keep them if she re-adds the school.
    return delRow('RecruitTarget', targetId);
  }

  /* ---------------------------- player: notes & contacts ---------------------------- */
  function programOf(id) { return index().byId.get(id) || null; }

  function addNote(user, programId, body, pinned) {
    const profile = profileFor(user); const program = programOf(programId);
    if (!program) throw httpErr(404, 'Program not found.');
    const b = text(body, 3000);
    if (!b) throw httpErr(400, 'Write something first.');
    const n = putRow('RecruitNote', { id: newId('rnt'), created_date: now(), updated_date: now(), profile_id: profile.id, program_id: programId, body: b, pinned: !!pinned });
    logActivity(profile, 'added_note', program);
    return n;
  }
  function ownedRow(entity, user, id) {
    const profile = profileFor(user, { create: false });
    const r = getRow(entity, id);
    return profile && r && r.profile_id === profile.id ? r : null;
  }
  function updateNote(user, id, patch) {
    const n = ownedRow('RecruitNote', user, id); if (!n) throw httpErr(404, 'Not found.');
    return putRow('RecruitNote', { ...n, body: patch.body !== undefined ? text(patch.body, 3000) || n.body : n.body, pinned: patch.pinned !== undefined ? !!patch.pinned : n.pinned, updated_date: now() });
  }
  function deleteNote(user, id) { if (!ownedRow('RecruitNote', user, id)) throw httpErr(404, 'Not found.'); return delRow('RecruitNote', id); }

  const CONTACT_KINDS = ['outreach', 'response', 'camp', 'follow_up', 'call', 'other'];
  function contactFields(body) {
    return {
      kind: CONTACT_KINDS.includes(body.kind) ? body.kind : 'outreach',
      direction: body.direction === 'inbound' ? 'inbound' : 'outbound',
      contacted_at: toDate(body.contacted_at) || today(),
      method: CONTACT_METHODS.includes(body.method) ? body.method : 'email',
      coach_id: str(body.coach_id, 80), coach_name: str(body.coach_name, 120),
      email: str(body.email, 160), phone: str(body.phone, 40),
      summary: str(body.summary, 300), response: text(body.response, 2000),
      follow_up_date: toDate(body.follow_up_date), notes: text(body.notes, 2000),
    };
  }
  const STAGE_ORDER = (s) => PIPELINE_KEYS.indexOf(s);
  function bumpStage(profile, programId, to) {
    const t = rows('RecruitTarget').find((x) => x.profile_id === profile.id && x.program_id === programId);
    if (t && t.stage !== 'not_pursuing' && STAGE_ORDER(t.stage) < STAGE_ORDER(to) && STAGE_ORDER(t.stage) < STAGE_ORDER('offer')) {
      putRow('RecruitTarget', { ...t, stage: to, updated_date: now() });
    }
  }
  function addContact(user, programId, body) {
    const profile = profileFor(user); const program = programOf(programId);
    if (!program) throw httpErr(404, 'Program not found.');
    const f = contactFields(body);
    const c = putRow('RecruitContact', { id: newId('rct'), created_date: now(), updated_date: now(), profile_id: profile.id, program_id: programId, ...f });
    if (f.kind === 'response' || f.direction === 'inbound') bumpStage(profile, programId, 'coach_responded');
    else if (f.kind === 'camp') bumpStage(profile, programId, 'camp_attended');
    else bumpStage(profile, programId, 'contacted');
    logActivity(profile, 'contacted_coach', program, f.summary);
    return c;
  }
  function updateContact(user, id, body) {
    const c = ownedRow('RecruitContact', user, id); if (!c) throw httpErr(404, 'Not found.');
    return putRow('RecruitContact', { ...c, ...contactFields({ ...c, ...body }), updated_date: now() });
  }
  function deleteContact(user, id) { if (!ownedRow('RecruitContact', user, id)) throw httpErr(404, 'Not found.'); return delRow('RecruitContact', id); }

  /* ------------------------------- player: camp tracking ------------------------------- */
  const CAMP_STATUSES = ['interested', 'registered', 'attended', 'skipped'];
  function trackCamp(user, body) {
    const profile = profileFor(user);
    const camp = body.camp_id ? getRow('ProgramCamp', body.camp_id) : null;
    const programId = camp?.program_id || body.program_id;
    const program = programOf(programId);
    if (!program) throw httpErr(404, 'Program not found.');
    const status = CAMP_STATUSES.includes(body.status) ? body.status : 'interested';
    const existing = camp && rows('RecruitCampTrack').find((x) => x.profile_id === profile.id && x.camp_id === camp.id);
    const rec = {
      ...(existing || { id: newId('rcc'), created_date: now(), profile_id: profile.id }),
      program_id: programId, camp_id: camp?.id || '', camp_name: camp?.camp_name || str(body.camp_name, 200), camp_date: camp?.camp_date || toDate(body.camp_date),
      status, notes: text(body.notes ?? existing?.notes, 1500), updated_date: now(),
    };
    if (!rec.camp_name) throw httpErr(400, 'Camp name is required.');
    putRow('RecruitCampTrack', rec);
    if (status === 'attended') { bumpStage(profile, programId, 'camp_attended'); logActivity(profile, 'attended_camp', program, rec.camp_name); }
    else if (!existing) logActivity(profile, 'added_camp', program, rec.camp_name);
    return rec;
  }
  function deleteCampTrack(user, id) { if (!ownedRow('RecruitCampTrack', user, id)) throw httpErr(404, 'Not found.'); return delRow('RecruitCampTrack', id); }

  /* --------------------------------- player: reads --------------------------------- */
  function programWorkspace(user, programId) {
    const profile = profileFor(user, { create: false });
    if (!profile) return { target: null, notes: [], contacts: [], camps: [] };
    const mine = (name) => rows(name).filter((r) => r.profile_id === profile.id && r.program_id === programId);
    return {
      target: rows('RecruitTarget').find((t) => t.profile_id === profile.id && t.program_id === programId) || null,
      notes: mine('RecruitNote').sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_date.localeCompare(a.created_date)),
      contacts: mine('RecruitContact').sort((a, b) => b.contacted_at.localeCompare(a.contacted_at) || b.created_date.localeCompare(a.created_date)),
      camps: mine('RecruitCampTrack').sort((a, b) => (b.camp_date || '').localeCompare(a.camp_date || '')),
    };
  }

  function noteView(user, programId) {
    const profile = profileFor(user, { create: false });
    if (profile) {
      const last = rows('RecruitActivity').filter((a) => a.profile_id === profile.id && a.program_id === programId && a.type === 'viewed_school').sort((a, b) => b.created_date.localeCompare(a.created_date))[0];
      if (!last || Date.now() - Date.parse(last.created_date) > 3600_000) logActivity(profile, 'viewed_school', programOf(programId));
    }
  }

  function dashboard(user) {
    const profile = profileFor(user);
    const idx = index();
    const targets = rows('RecruitTarget').filter((t) => t.profile_id === profile.id);
    const contacts = rows('RecruitContact').filter((c) => c.profile_id === profile.id);
    const cards = targets.map((t) => {
      const p = idx.byId.get(t.program_id);
      if (!p) return null;
      const s = summarize(p, idx);
      const mine = contacts.filter((c) => c.program_id === t.program_id).sort((a, b) => b.contacted_at.localeCompare(a.contacted_at));
      const due = mine.filter((c) => c.follow_up_date && c.follow_up_date >= today()).sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date))[0];
      return {
        target_id: t.id, stage: t.stage, tier: t.tier || '', order: t.order || 0, added: t.created_date,
        school: s, distance_miles: profile.state ? stateDistanceMiles(profile.state, p.state) : null,
        last_contact: mine[0] ? { contacted_at: mine[0].contacted_at, summary: mine[0].summary, kind: mine[0].kind } : null,
        next_follow_up: due ? due.follow_up_date : null,
      };
    }).filter(Boolean).sort((a, b) => a.order - b.order || a.school.school_name.localeCompare(b.school.school_name));
    const ids = new Set(targets.map((t) => t.program_id));
    const t = today();
    const tracked = rows('RecruitCampTrack').filter((c) => c.profile_id === profile.id);
    const horizon = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
    const upcoming = rows('ProgramCamp').filter((c) => ids.has(c.program_id) && c.verification_status !== 'archived' && (c.end_date || c.camp_date) >= t && c.camp_date <= horizon)
      .sort((a, b) => a.camp_date.localeCompare(b.camp_date)).slice(0, 60)
      .map((c) => ({ ...c, school_name: idx.byId.get(c.program_id)?.school_name, program_slug: idx.byId.get(c.program_id)?.slug, my_status: tracked.find((x) => x.camp_id === c.id)?.status || null }));
    const activity = rows('RecruitActivity').filter((a) => a.profile_id === profile.id).sort((a, b) => b.created_date.localeCompare(a.created_date)).slice(0, 25);
    const followUps = contacts.filter((c) => c.follow_up_date && c.follow_up_date >= t).sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date)).slice(0, 10)
      .map((c) => ({ id: c.id, follow_up_date: c.follow_up_date, school_name: idx.byId.get(c.program_id)?.school_name, program_slug: idx.byId.get(c.program_id)?.slug, summary: c.summary }));
    return { profile, cards, upcoming_camps: upcoming, activity, follow_ups: followUps, my_camps: tracked };
  }

  function compare(ids) {
    const idx = index();
    return ids.slice(0, 4).map((id) => idx.byId.get(id)).filter(Boolean).map((p) => {
      const s = summarize(p, idx);
      return { ...s, academic_info: p.academic_info || '', enrollment: p.enrollment || null, acceptance_rate: p.acceptance_rate ?? null, athletics_website: p.athletics_website, team_website: p.team_website };
    });
  }

  function adminPlayers() {
    return rows('RecruitPlayerProfile').map((p) => ({
      id: p.id, owner_user_id: p.owner_user_id, name: [p.first_name, p.last_name].filter(Boolean).join(' ') || '(not set up)', grad_year: p.grad_year, state: p.state,
      privacy: p.privacy, targets: rows('RecruitTarget').filter((t) => t.profile_id === p.id).length, created_date: p.created_date, disabled: !!p.disabled,
    })).sort((a, b) => b.created_date.localeCompare(a.created_date));
  }
  function adminSetPlayerDisabled(id, disabled) {
    const p = getRow('RecruitPlayerProfile', id); if (!p) throw httpErr(404, 'Not found.');
    return putRow('RecruitPlayerProfile', { ...p, disabled: !!disabled, updated_date: now() });
  }

  return {
    rows, getRow, search, detail, summarize, meta, compare, listCamps, campDetail,
    /** Drop cached indexes after the store was reloaded from the database. */
    refresh() { catalogVersion++; },
    previewImport: previewImportSlim, commitImport, bootstrap, stats,
    adminList, adminSave, adminSetStatus, adminDelete, adminSourceNote, adminPlayers, adminSetPlayerDisabled,
    profileFor, canAct, saveProfile, rotateShareToken, sharedProfile, sharedList,
    addTarget, updateTarget, removeTarget, addNote, updateNote, deleteNote, addContact, updateContact, deleteContact,
    trackCamp, deleteCampTrack, programWorkspace, noteView, dashboard, myTarget,
  };
}

export function httpErr(status, message) {
  const e = new Error(message); e.status = status; return e;
}
