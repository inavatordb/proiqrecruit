import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecruitingService } from './service.mjs';
import { DEFAULT_TEMPLATES } from './letters.mjs';

const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'recruiting');
const A = { id: 'u_a', email: 'a@x.com' };
const B = { id: 'u_b', email: 'b@x.com' };

function makeSvc() {
  const store = new Map();
  const svc = createRecruitingService({ loadEntity: (n) => { if (!store.has(n)) store.set(n, new Map()); return store.get(n); }, persistEntity: () => {}, seedDir });
  svc.bootstrap();
  return svc;
}

describe('recruiting outreach', () => {
  it('ships five untouchable defaults; copies and custom templates are private to the athlete', () => {
    const svc = makeSvc();
    const before = JSON.stringify(DEFAULT_TEMPLATES);
    expect(svc.lettersFor(A).defaults).toHaveLength(5);
    const mine = svc.createTemplate(A, { based_on_default: 'initial-introduction', body: 'Hello Coach [Coach Last Name], my own words.' });
    expect(mine.based_on_default).toBe('initial-introduction');
    svc.updateTemplate(A, mine.id, { body: 'Changed again.' });
    expect(JSON.stringify(DEFAULT_TEMPLATES)).toBe(before);
    expect(svc.lettersFor(A).defaults[0].body).toContain('My name is [Player Name]');
    expect(svc.lettersFor(B).templates).toEqual([]);
    expect(() => svc.updateTemplate(B, mine.id, { body: 'hijack' })).toThrow(/Not found/);
    expect(() => svc.deleteTemplate(B, mine.id)).toThrow(/Not found/);
    const copy = svc.createTemplate(A, { copy_of: mine.id });
    expect(copy.id).not.toBe(mine.id);
    expect(() => svc.createTemplate(B, { copy_of: mine.id })).toThrow(/not found/i);
    expect(svc.createTemplate(A, { name: 'From scratch', subject: 's', body: 'b' }).based_on_default).toBe('');
  });

  it('manages highlights per athlete and only accepts https links', () => {
    const svc = makeSvc();
    expect(() => svc.addHighlight(A, { title: 'x', url: 'javascript:alert(1)' })).toThrow();
    expect(() => svc.addHighlight(A, { title: 'x', url: 'http://example.com/v' })).toThrow(/https/);
    const h1 = svc.addHighlight(A, { title: 'Fall reel', url: 'https://www.hudl.com/video/1', grad_year: 2028, tags: 'goals, assists' });
    const h2 = svc.addHighlight(A, { title: 'Tournament', url: 'https://youtu.be/abc' });
    expect(h1.platform).toBe('Hudl'); expect(h2.platform).toBe('YouTube'); expect(h1.tags).toEqual(['goals', 'assists']);
    expect(svc.reorderHighlights(A, [h2.id, h1.id]).map((h) => h.id)).toEqual([h2.id, h1.id]);
    expect(svc.listHighlights(B)).toEqual([]);
    expect(() => svc.deleteHighlight(B, h1.id)).toThrow();
    svc.updateHighlight(A, h1.id, { featured: true });
    expect(svc.listHighlights(A)[0].id).toBe(h1.id);
  });

  it('prepares compose data and records preparation without ever claiming a send', () => {
    const svc = makeSvc();
    svc.saveProfile(A, { first_name: 'Ava', last_name: 'Lee', grad_year: 2028, primary_position: 'CM', positions: ['CM'], club: 'FC Test', academic_interests: 'Biology', email: 'ava@x.com' });
    const duke = svc.rows('CollegeProgram').find((p) => p.school_name === 'Duke');
    const data = svc.composeData(A, duke.id);
    expect(data.fields).toMatchObject({ 'College Name': 'Duke', 'Player Name': 'Ava Lee', 'Graduation Year': '2028', Position: 'central midfielder', 'Club or High School Team': 'FC Test' });
    expect(data.coaches.length).toBeGreaterThan(0);
    expect(data.coaches.every((c) => typeof c.email_verified === 'boolean')).toBe(true);
    const d = svc.saveDraft(A, { program_id: duke.id, coach_id: data.coaches[0].id, subject: 's', body: 'b', status: 'email_app_opened' });
    expect(d.status).toBe('email_app_opened'); expect(d.send_confirmed).toBe(false);
    expect(svc.saveDraft(A, { program_id: duke.id, status: 'sent' }).status).toBe('prepared');
    expect(svc.composeData(B, duke.id).drafts).toEqual([]);
    expect(() => svc.deleteDraft(B, d.id)).toThrow();
  });
});
