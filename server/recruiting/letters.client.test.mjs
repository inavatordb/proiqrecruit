import { describe, it, expect } from 'vitest';
import { fillPlaceholders, unresolved, buildMailto, toReusable, highlightBlock, MAILTO_LIMIT } from '../../src/lib/letters.js';

describe('Contact Coach helpers', () => {
  it('fills known placeholders and flags the rest', () => {
    const t = 'Dear Coach [Coach Last Name], I play [Position] at [Club or High School Team]. [Why I Am Interested in Your Program]';
    const out = fillPlaceholders(t, { 'Coach Last Name': 'Smith', Position: 'striker', 'Club or High School Team': '' });
    expect(out).toContain('Coach Smith');
    expect(unresolved(out)).toEqual(['[Club or High School Team]', '[Why I Am Interested in Your Program]']);
  });
  it('encodes mailto safely and detects links that are too long', () => {
    const m = buildMailto('coach@duke.edu', 'Hi & hello?', 'Line 1\nLine 2 & "quotes" #1');
    expect(m.url.startsWith('mailto:coach@duke.edu?subject=Hi%20%26%20hello%3F&body=')).toBe(true);
    expect(m.url).toContain('Line%201%0D%0ALine%202');
    expect(m.tooLong).toBe(false);
    expect(buildMailto('a@b.edu', 's', 'x'.repeat(MAILTO_LIMIT)).tooLong).toBe(true);
  });
  it('turns school-specific text back into placeholders for reusable templates', () => {
    const block = highlightBlock([{ title: 'Reel', url: 'https://youtu.be/x' }]);
    const out = toReusable(`Coach Smith at Duke, watch ${block}`, { schoolName: 'Duke', coachFirst: 'Pat', coachLast: 'Smith', highlightText: block });
    expect(out).toBe('Coach [Coach Last Name] at [College Name], watch [Highlight Video Link]');
  });
});
