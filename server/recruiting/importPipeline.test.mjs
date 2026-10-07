import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecruitingService } from './service.mjs';
import { TEMPLATE_HEADERS, parseCsvWithHeader, toDate } from './core.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const seedDir = path.join(root, 'server', 'seeds', 'recruiting');

function makeSvc() {
  const store = new Map();
  const loadEntity = (n) => { if (!store.has(n)) store.set(n, new Map()); return store.get(n); };
  return createRecruitingService({ loadEntity, persistEntity: () => {}, seedDir });
}

describe('templates', () => {
  it('match the specified headers exactly, and their example rows are never imported', () => {
    const want = {
      programs: 'program_id,school_name,sport,gender,division,conference,city,state,school_website,athletics_website,soccer_website,camps_url,source_url,source_type,verified,last_verified_at,notes',
      coaches: 'program_id,first_name,last_name,title,email,phone,profile_url,source_url,source_type,verified,last_verified_at,notes',
      program_seasons: 'program_id,season,wins,losses,ties,conference_wins,conference_losses,conference_ties,conference_finish,conference_tournament_result,ncaa_appearance,ncaa_round,goals_for,goals_against,source_url,source_type,verified,last_verified_at,notes',
      rankings: 'program_id,season,ranking_organization,ranking_type,ranking,ranking_date,source_url,source_type,verified,last_verified_at,notes',
      camps: 'program_id,camp_name,camp_type,start_date,end_date,registration_deadline,location,age_range,grad_years,cost,registration_url,official_url,season,source_url,source_type,verified,last_verified_at,notes',
      id_camp_appearances: 'program_id,coach_id,event_name,organization,event_date,location,event_type,registration_url,source_url,source_type,verified,last_verified_at,notes',
    };
    for (const [k, h] of Object.entries(want)) expect(TEMPLATE_HEADERS[k]).toBe(h);

    const svc = makeSvc();
    const kinds = { programs: 'programs', coaches: 'coaches', seasons: 'program_seasons', rankings: 'rankings', camps: 'camps', idcamps: 'id_camp_appearances' };
    for (const [kind, file] of Object.entries(kinds)) {
      const csv = fs.readFileSync(path.join(root, 'data', 'import', 'templates', `${file}.csv`), 'utf8');
      const plan = svc.previewImport(kind, csv);
      expect(plan.blocked).toBe(false);
      expect(plan.summary).toMatchObject({ found: 1, skipped: 1, new: 0, errors: 0 });
      svc.commitImport(kind, csv);
    }
    expect(svc.rows('CollegeProgram')).toHaveLength(0);
  });
});

describe('import pipeline', () => {
  let svc;
  beforeEach(() => { svc = makeSvc(); svc.bootstrap(); });
  const programsCsv = (rows) => `program_id,school_name,sport,gender,division,conference,city,state,source_url,source_type,verified\n${rows.join('\n')}`;

  it('attaches a stable program code to an existing program instead of duplicating it', () => {
    const before = svc.rows('CollegeProgram').length;
    const csv = programsCsv(['ACC_DUKE_WSOC,Duke,soccer,women,D1,Atlantic Coast Conference,Durham,NC,https://goduke.com/womens-soccer,official_university,yes']);
    const plan = svc.previewImport('programs', csv);
    expect(plan.summary).toMatchObject({ new: 0, updated: 1, errors: 0 });
    svc.commitImport('programs', csv);
    expect(svc.rows('CollegeProgram')).toHaveLength(before);
    const duke = svc.rows('CollegeProgram').find((p) => p.slug === 'duke');
    expect(duke.program_code).toBe('ACC_DUKE_WSOC');
    expect(duke.verification_status).toBe('verified');
    expect(duke.source_type).toBe('University Athletics');
    // second run is a no-op
    expect(svc.previewImport('programs', csv).summary).toMatchObject({ new: 0, updated: 0, skipped: 1 });
  });

  it('adds brand-new programs and resolves children by program code', () => {
    svc.commitImport('programs', programsCsv(['ACC_TEST_WSOC,Testville State,soccer,women,D1,Atlantic Coast Conference,Testville,NC,,,']));
    const prog = svc.rows('CollegeProgram').find((p) => p.program_code === 'ACC_TEST_WSOC');
    expect(prog.verification_status).toBe('needs_review');
    const plan = svc.previewImport('coaches', 'program_id,first_name,last_name,title,email\nACC_TEST_WSOC,Pat,Lee,Head Coach,pat@testville.edu\nACC_TEST_WSOC,Sam,Roe,Assistant Coach,\nNOPE_X_WSOC,No,One,Head Coach,');
    expect(plan.summary).toMatchObject({ found: 3, new: 2, errors: 1, missing_email: 1 });
    expect(plan.items.find((i) => i.action === 'error').messages[0]).toMatch(/program not found/);
  });

  it('reports duplicate program ids, bad emails, bad dates and unverifiable "verified" flags', () => {
    const dup = svc.previewImport('programs', programsCsv([
      'ACC_AAA_WSOC,Alpha U,soccer,women,D1,ACC,A,NC,,,', 'ACC_AAA_WSOC,Beta U,soccer,women,D1,ACC,B,NC,,,',
    ]));
    expect(dup.summary.errors).toBe(1);
    expect(dup.items[1].messages[0]).toMatch(/duplicate program_id/);

    const coaches = svc.previewImport('coaches', 'school_name,first_name,last_name,email,verified,source_url\nDuke,A,B,not-an-email,yes,\nDuke,C,D,coach@gmail.com,no,https://x.edu');
    expect(coaches.items[0].messages.join(' ')).toMatch(/malformed/);
    expect(coaches.items[0].messages.join(' ')).toMatch(/marked verified but has no source_url/);
    expect(coaches.items[1].messages.join(' ')).toMatch(/personal webmail/);
    expect(coaches.summary.missing_email).toBe(2);

    const camps = svc.previewImport('camps', 'school_name,camp_name,start_date,end_date\nDuke,Bad Date Camp,13/45/2026,\nDuke,Backwards,2026-07-10,2026-07-01\nDuke,Fine Camp,7/15/2026,');
    expect(camps.summary).toMatchObject({ errors: 2, new: 1 });
    expect(toDate('7')).toBe('');
  });

  it('blocks a file with missing required columns and says so', () => {
    const plan = svc.previewImport('seasons', 'school_name,wins\nDuke,5');
    expect(plan.blocked).toBe(true);
    expect(plan.columns.missing).toContain('season');
    expect(() => svc.commitImport('seasons', 'school_name,wins\nDuke,5')).toThrow(/Column check failed/);
  });

  it('keeps conference history while the current conference changes', () => {
    const ap = svc.rows('CollegeProgram').find((p) => p.slug === 'austin-peay');
    expect(ap.conference).toBe('United Athletic Conference');
    const d = svc.detail('austin-peay');
    expect(d.conference_history.map((h) => `${h.conference}|${h.start_season || ''}|${h.end_season || ''}`)).toEqual([
      'United Athletic Conference|2026|', 'Atlantic Sun Conference||2025']);
    svc.commitImport('seasons', 'school_name,season,wins,losses,ties\nAustin Peay,2025,5,10,2\nAustin Peay,2026,1,0,0');
    const seasons = svc.detail('austin-peay').seasons;
    expect(seasons.find((s) => s.season === 2025).conference_that_season).toBe('Atlantic Sun Conference');
    expect(seasons.find((s) => s.season === 2026).conference_that_season).toBe('United Athletic Conference');
    expect(svc.detail('west-florida').conference_history[0]).toMatchObject({ conference: 'Atlantic Sun Conference', start_season: 2026 });

    // a re-import that changes the program's conference warns that history should be added, and history rows stay untouched
    const plan = svc.previewImport('programs', programsCsv(['ASUN_APSU_WSOC,Austin Peay,soccer,women,D1,Some New Conference,Clarksville,TN,,,']));
    expect(plan.items[0].messages.join(' ')).toMatch(/conference_history/);
    expect(svc.rows('ProgramConferenceHistory').filter((h) => h.program_id === ap.id)).toHaveLength(2);
  });

  it('keeps 2023-2025 intact when 2026 is imported; current season is flagged', () => {
    svc.commitImport('seasons', 'school_name,season,wins,losses,ties,verified,source_url\nDuke,2025,14,4,2,yes,https://x.edu');
    svc.commitImport('seasons', 'school_name,season,wins,losses,ties\nDuke,2026,2,0,0');
    const d = svc.detail('duke');
    expect(d.seasons.find((s) => s.season === 2025).record).toBe('14-4-2');
    expect(d.current_season.season).toBe(2026);
    expect(d.recent_season_years).not.toContain(2026);
  });

  it('stores each ranking as its own record, including week-style types', () => {
    svc.commitImport('rankings', 'school_name,season,ranking_organization,ranking_type,ranking,ranking_date,source_url\nDuke,2025,United Soccer Coaches,Preseason,5,2025-08-15,https://x.edu\nDuke,2025,United Soccer Coaches,Week 4,3,2025-09-23,https://x.edu\nDuke,2025,United Soccer Coaches,Week 8,2,2025-10-21,https://x.edu\nDuke,2025,United Soccer Coaches,Final,4,2025-12-10,https://x.edu');
    const org = svc.detail('duke').rankings[0].organizations[0];
    expect(svc.rows('ProgramRanking')).toHaveLength(4);
    expect(org).toMatchObject({ highest: 2, final: 4, preseason: 5, weeks: 2 });
  });

  it('keeps official camps and external events apart; resolves coach_id by name', () => {
    svc.commitImport('coaches', 'school_name,first_name,last_name,title\nDuke,Pat,Lee,Head Coach');
    svc.commitImport('camps', 'program_id,school_name,camp_name,camp_type,start_date,grad_years,official_url,season\n,Duke,Elite ID,Elite ID Camp,2026-07-15,2027;2028,https://goduke.com/camps,2026');
    const plan = svc.previewImport('idcamps', 'school_name,coach_id,event_name,organization,event_date\nDuke,pat-lee,Showcase,Exact Soccer,2026-12-05\nDuke,nobody-here,Showcase 2,Exact Soccer,2026-12-06');
    expect(plan.summary).toMatchObject({ new: 2, errors: 0 });
    expect(plan.items[1].messages.join(' ')).toMatch(/matches no coach/);
    svc.commitImport('idcamps', 'school_name,coach_id,event_name,organization,event_date\nDuke,pat-lee,Showcase,Exact Soccer,2026-12-05');
    const d = svc.detail('duke');
    expect(d.camps.current.map((c) => c.camp_name)).toEqual(['Elite ID']);
    expect(d.camps.current[0]).toMatchObject({ official: true, graduation_years: ['2027', '2028'] });
    expect(d.id_appearances.upcoming[0]).toMatchObject({ official: false, event_organization: 'Exact Soccer' });
    expect(d.id_appearances.upcoming[0].coach_id).toMatch(/^coach_/);
  });

  it('records each commit in import history', () => {
    svc.commitImport('coaches', 'school_name,first_name,last_name,email,source_url,source_type\nDuke,Pat,Lee,pl@duke.edu,https://goduke.com/c,official_university', { actor: 'admin@x.com', filename: 'coaches.csv' });
    const run = svc.rows('RecruitImport').at(-1);
    expect(run).toMatchObject({ import_type: 'coaches', filename: 'coaches.csv', user: 'admin@x.com', inserted: 1, updated: 0, skipped: 0, errors: 0, status: 'completed' });
    expect(run.started_at).toBeTruthy();
    expect(run.completed_at).toBeTruthy();
    expect(parseCsvWithHeader('a,b\n1,2').header).toEqual(['a', 'b']);
  });
});
