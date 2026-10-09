import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecruitingService } from './service.mjs';
import { RECRUITING_ENTITIES, parseCsv, isPersonalEmail, safeUrl, planImport } from './core.mjs';

const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'recruiting');

function makeSvc() {
  const store = new Map();
  const loadEntity = (n) => { if (!store.has(n)) store.set(n, new Map()); return store.get(n); };
  return createRecruitingService({ loadEntity, persistEntity: () => {}, seedDir });
}
const A = { id: 'u_a', email: 'a@x.com' };
const B = { id: 'u_b', email: 'b@x.com' };

describe('bundled seed', () => {
  it('loads the full D1 and D2 lists and is idempotent', () => {
    const svc = makeSvc();
    svc.bootstrap();
    const s = svc.stats();
    expect(s.programs_by_division.D1).toBeGreaterThanOrEqual(340);
    expect(s.programs_by_division.D2).toBeGreaterThanOrEqual(250);
    const again = svc.bootstrap();
    expect(again.loaded).toEqual([]);
    expect(svc.search({ division: 'D2', limit: 100 }).results.every((r) => r.division === 'D2')).toBe(true);
  });

  it('seeds NCAA tournament history for three seasons of the 64-team field', () => {
    const svc = makeSvc();
    svc.bootstrap();
    const d = svc.detail('stanford');
    expect(d.seasons.find((s) => s.season === 2025).ncaa_tournament_round).toBe('Runner-up');
    expect(svc.search({ ncaa: '1', division: 'D1', limit: 100 }).total).toBeGreaterThan(60);
    expect(svc.search({ ncaa_round: 'semifinal', limit: 100 }).total).toBeGreaterThan(5);
    expect(svc.search({ ncaa: '1', division: 'D2' }).total).toBe(0);
  });
});

describe('import safety', () => {
  let svc;
  beforeEach(() => { svc = makeSvc(); svc.bootstrap(); });

  it('never stores personal webmail as a coach email', () => {
    expect(isPersonalEmail('coach@gmail.com')).toBe(true);
    const csv = 'school_name,first_name,last_name,title,email\nChestnut Hill College,Pat,Smith,Head Coach,pat@gmail.com\nChestnut Hill College,Lee,Jones,Assistant Coach,lee@ua.edu';
    svc.commitImport('coaches', csv);
    const d = svc.detail('chestnut-hill-college');
    const pat = d.coaches.find((c) => c.last_name === 'Smith');
    expect(pat.email).toBe('');
    expect(pat.email_listed).toBe(false);
    expect(d.coaches.find((c) => c.last_name === 'Jones').email).toBe('lee@ua.edu');
    expect(d.coaches[0].role).toBe('head');
  });

  it('does not overwrite verified data without an explicit override', () => {
    const csv = 'school_name,season,wins,losses,ties\nChestnut Hill College,2025,14,4,2';
    svc.commitImport('seasons', csv);
    const id = svc.rows('ProgramSeason').find((s) => s.season === 2025 && s.program_id.endsWith('chestnut-hill-college')).id;
    svc.adminSetStatus('seasons', id, 'verified', 'admin');
    const changed = 'school_name,season,wins,losses,ties\nChestnut Hill College,2025,1,1,1';
    const plan = svc.previewImport('seasons', changed);
    expect(plan.summary.review).toBe(1);
    svc.commitImport('seasons', changed);
    expect(svc.getRow('ProgramSeason', id).wins).toBe(14);
    svc.commitImport('seasons', changed, { overwriteVerified: true });
    expect(svc.getRow('ProgramSeason', id).wins).toBe(1);
  });

  it('blank incoming values never erase stored ones', () => {
    svc.commitImport('seasons', 'school_name,season,wins,losses,ties\nChestnut Hill College,2025,14,4,2');
    svc.commitImport('seasons', 'school_name,season,ncaa_tournament_appearance,ncaa_tournament_round\nChestnut Hill College,2025,yes,Round of 16');
    const s = svc.rows('ProgramSeason').find((s) => s.season === 2025 && s.program_id.endsWith('chestnut-hill-college'));
    expect(s.wins).toBe(14);
    expect(s.ncaa_tournament_round).toBe('Round of 16');
  });

  it('reports errors and duplicates', () => {
    const csv = 'school_name,first_name,last_name\nNoSuchSchool,A,B\nChestnut Hill College,C,D\nChestnut Hill College,C,D';
    const plan = svc.previewImport('coaches', csv);
    expect(plan.summary).toMatchObject({ found: 3, new: 1, duplicate: 1, errors: 1 });
  });

  it('rejects non-http URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('example.com/x')).toBe('https://example.com/x');
  });
});

describe('search + program page', () => {
  it('derives records, rankings and camps only from stored rows', () => {
    const svc = makeSvc(); svc.bootstrap();
    svc.commitImport('seasons', 'school_name,season,wins,losses,ties,conference_champion\nChestnut Hill College,2025,14,4,2,no\nChestnut Hill College,2024,12,5,3,no\nChestnut Hill College,2023,15,3,2,yes');
    svc.commitImport('rankings', 'school_name,season,organization,ranking_type,rank,ranking_date\nChestnut Hill College,2025,United Soccer Coaches,weekly,12,2025-10-01\nChestnut Hill College,2025,United Soccer Coaches,final,18,2025-12-10');
    const y = new Date().getUTCFullYear();
    svc.commitImport('camps', `school_name,camp_name,camp_type,camp_date\nChestnut Hill College,July ID Camp,ID Camp,${y}-07-15\nChestnut Hill College,Prior ID Camp,ID Camp,${y - 1}-07-10`);
    const d = svc.detail('chestnut-hill-college');
    expect(d.recent_season_years).toEqual([2025, 2024, 2023]);
    expect(d.rankings[0].organizations[0]).toMatchObject({ highest: 12, final: 18 });
    expect(d.camps.current).toHaveLength(1);
    expect(d.camps.previous).toHaveLength(1);
    expect(svc.search({ champion: '1' }).results.map((r) => r.school_name)).toEqual(['Chestnut Hill College']);
    expect(svc.search({ top: '15', division: 'D2' }).total).toBe(1);
    expect(svc.search({ ranked: '1', division: 'D2' }).total).toBe(1);
  });
});

describe('player data isolation', () => {
  it('keeps notes, contacts and pipeline private to each profile', () => {
    const svc = makeSvc(); svc.bootstrap();
    const prog = svc.search({ q: 'Alabama' }).results[0];
    const ta = svc.addTarget(A, prog.id);
    svc.addNote(A, prog.id, 'Liked campus');
    svc.addContact(A, prog.id, { kind: 'outreach', summary: 'Emailed coach' });
    expect(svc.programWorkspace(A, prog.id).notes).toHaveLength(1);
    expect(svc.programWorkspace(A, prog.id).target.stage).toBe('contacted');

    expect(svc.programWorkspace(B, prog.id).notes).toHaveLength(0);
    expect(svc.programWorkspace(B, prog.id).contacts).toHaveLength(0);
    expect(svc.programWorkspace(B, prog.id).target).toBeNull();
    expect(svc.dashboard(B).cards).toHaveLength(0);

    // B cannot touch A's rows by id.
    svc.profileFor(B);
    const noteId = svc.programWorkspace(A, prog.id).notes[0].id;
    expect(() => svc.updateTarget(B, ta.id, { stage: 'committed' })).toThrow(/Not found/);
    expect(() => svc.deleteNote(B, noteId)).toThrow(/Not found/);
    expect(() => svc.removeTarget(B, ta.id)).toThrow(/Not found/);
    expect(svc.programWorkspace(A, prog.id).notes).toHaveLength(1);
  });

  it('never exposes contact or guardian data on a shared profile', () => {
    const svc = makeSvc(); svc.bootstrap();
    const p = svc.saveProfile(A, { first_name: 'Ava', last_name: 'Stone', email: 'ava@secret.com', phone: '555-1212', guardian_name: 'Mom', guardian_email: 'mom@secret.com', grad_year: 2028, positions: 'CM', privacy: 'public', bio: 'hi' });
    const view = svc.sharedProfile(p.slug);
    const dump = JSON.stringify(view);
    expect(view.name).toBe('Ava S.');
    for (const secret of ['ava@secret.com', '555-1212', 'mom@secret.com', 'Mom', 'owner_user_id']) expect(dump).not.toContain(secret);
  });

  it('honours private / unlisted / public', () => {
    const svc = makeSvc(); svc.bootstrap();
    const p = svc.saveProfile(A, { first_name: 'Ava', last_name: 'Stone' });
    expect(p.privacy).toBe('private');
    expect(svc.sharedProfile(p.slug)).toBeNull();
    const u = svc.saveProfile(A, { first_name: 'Ava', last_name: 'Stone', privacy: 'unlisted' });
    expect(svc.sharedProfile(u.slug)).toBeNull();
    expect(svc.sharedProfile(u.slug, u.share_token)).not.toBeNull();
  });
});

describe('route exposure', () => {
  it('blocks every recruiting entity from the generic entity route', () => {
    for (const n of ['RecruitNote', 'RecruitTarget', 'RecruitPlayerProfile', 'CollegeProgram', 'RecruitContact']) expect(RECRUITING_ENTITIES.has(n)).toBe(true);
  });
  it('parses quoted CSV', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([{ a: 'x, y', b: 'he said "hi"' }]);
    expect(planImport).toBeTypeOf('function');
  });
});
