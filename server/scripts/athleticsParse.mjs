/**
 * Parsers for official athletics sites (Sidearm "Nuxt" sites and WMT Digital sites). Pure functions: HTML in, data out.
 * A parser returns nothing/ok:false when a page does not look right -- it never fills gaps.
 */
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&rsquo;': '’', '&lsquo;': '‘', '&ndash;': '–', '&mdash;': '—' };
export const decode = (s) => String(s).replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (ENT[m]) return ENT[m];
  if (e[0] === '#') { const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return m;
});
export const strip = (h) => decode(String(h).replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Every <table> as { before, headers, rows:[[{th,text,mail}]] }. */
export function tables(html) {
  const out = [];
  const re = /<table[\s\S]*?<\/table>/gi; let m;
  while ((m = re.exec(html))) {
    const t = m[0];
    const before = strip(html.slice(Math.max(0, m.index - 600), m.index)).slice(-120);
    const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t([dh])[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => ({ th: c[1] === 'h', text: strip(c[2]), mail: (c[2].match(/mailto:([^"'?\s>]+)/i) || [])[1] || '' })));
    const head = rows.find((r) => r.some((c) => c.th)) || rows[0] || [];
    out.push({ before, headers: head.map((c) => c.text.toLowerCase()), rows: rows.filter((r) => r !== head && r.length) });
  }
  return out;
}

const COACH_TITLE = /coach|director of (soccer )?operations|recruiting|operations|volunteer|player development|analyst/i;
const NOT_COACH = /trainer|athletic communications|sports information|strength|performance coach|nutrition|academic|compliance|equipment|video|marketing|ticket|sport psychology|mental|physician|doctor|\bSWA\b|athletics director/i;
const okPerson = (name, title) => name && title && !/\d/.test(name) && name.split(' ').length >= 2 && name.length <= 50 && COACH_TITLE.test(title) && !NOT_COACH.test(title);

/** WMT Digital layouts: cards/list items inside "...roster-staff-members-(card|list)-item". */
function wmtStaff(html) {
  const start = html.indexOf('roster-staff-members');
  if (start < 0) return [];
  const chunks = html.slice(start).split(/(?=<(?:div|li)[^>]*class="[^"]*roster-staff-members-(?:card|list)-item)/).slice(1);
  const found = [];
  for (const c of chunks) {
    const body = c.slice(0, 2500);
    const pos = (body.match(/class="[^"]*position[^"]*"[^>]*>([^<]+)</) || [])[1];
    const link = (body.match(/<a\b[^>]*href="[^"]*\/staff\/[^"]*"[^>]*>\s*([^<>]{3,50}?)\s*<\/a>/) || [])[1];
    const alt = (body.match(/<img[^>]*alt="([^"]{3,50})"/) || [])[1];
    const heading = (body.match(/class="[^"]*(?:card|item)__title[^"]*"[^>]*>(?:<!--\[-->)*\s*(?:<a[^>]*>)?\s*([^<>]{3,50}?)\s*</) || [])[1];
    const name = decode(link || heading || alt || '').replace(/\s+/g, ' ').trim();
    const title = decode(pos || '').replace(/\s+/g, ' ').trim();
    if (okPerson(name, title)) found.push({ name, title, email: '', phone: '' });
  }
  return found;
}

/** Staff table (Sidearm) -> [{name,title,email,phone}]. Only the "Coaching Staff" table, never "Support Staff". */
export function parseCoaches(html) {
  const wmt = wmtStaff(html);
  if (wmt.length) return wmt;
  const found = [];
  for (const t of tables(html)) {
    let ni = t.headers.findIndex((h) => /^name/.test(h)); let ti = t.headers.findIndex((h) => /title|position/.test(h));
    if ((ni < 0 || ti < 0) && /coach/i.test(t.before) && t.rows.length) { // some sites leave the header cells empty: infer the columns from the content
      ni = 0; ti = (t.rows[0] || []).findIndex((_, c) => t.rows.some((r) => /coach/i.test(r[c]?.text || '')));
    }
    if (ni < 0 || ti < 0 || ni === ti) continue;
    if (/support|administrat|medical|athletic training/i.test(t.before)) continue;
    const ei = t.headers.findIndex((h) => /e-?mail/.test(h)); const pi = t.headers.findIndex((h) => /phone/.test(h));
    for (const r of t.rows) {
      const name = (r[ni]?.text || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
      const title = (r[ti]?.text || '').trim();
      if (!okPerson(name, title)) continue;
      let email = r.map((c) => c.mail).find(Boolean) || ''; if (!email && ei >= 0) email = ((r[ei]?.text || '').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i) || [])[0] || '';
      const phone = pi >= 0 ? ((r[pi]?.text || '').match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) || [])[0] || '' : '';
      found.push({ name, title, email: email.toLowerCase(), phone });
    }
    if (found.length) break;
  }
  return found;
}

const triple = (w, l, t) => ({ wins: +w, losses: +l, ties: t === undefined || t === '' ? 0 : +t });
/** Season summary from a schedule page. Rejects a page that does not demonstrably show the requested season. */
export function parseSeason(html, year) {
  const text = strip(html);
  const dates = [...html.matchAll(/"(\d{4})-(\d{2})-\d{2}T\d{2}:\d{2}:\d{2}"/g)].map((d) => [+d[1], +d[2]]);
  const inSeason = dates.filter(([y, mo]) => y === year && mo >= 8 && mo <= 12).length;
  const textYears = (text.match(new RegExp(`(Aug|Sep|Oct|Nov|Dec)[a-z]* \\d{1,2},? ${year}`, 'g')) || []).length;
  const selected = (html.match(/<option value="(\d{4})"[^>]*selected/) || [])[1];
  if (selected && Number(selected) !== year) return { ok: false, reason: `page shows season ${selected}` };
  if (!selected && inSeason < 5 && textYears < 3) return { ok: false, reason: `page does not show ${year} games` };
  let o = text.match(/Overall Wins (\d+) Losses (\d+)(?: Ties (\d+))?/i);
  let c = text.match(/Conf(?:erence)? Wins (\d+) Losses (\d+)(?: Ties (\d+))?/i);
  if (!o) { o = text.match(/Overall:?\s*(\d+)-(\d+)(?:-(\d+))?/i); c = c || text.match(/Conf(?:erence|\.)?:?\s*(\d+)-(\d+)(?:-(\d+))?/i); }
  if (!o) return { ok: false, reason: 'no overall record on page' };
  const overall = triple(o[1], o[2], o[3]);
  const g = overall.wins + overall.losses + overall.ties;
  if (g < 1 || g > 40) return { ok: false, reason: `implausible record ${o[0]}` };
  return { ok: true, overall, conf: c ? triple(c[1], c[2], c[3]) : null, games: g };
}

/** An official camps link from site navigation. */
export function findCampsLink(html, base) {
  const cands = [];
  for (const a of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = strip(a[2]); const href = decode(a[1]);
    if (/^(youth )?(sports )?camps?( (&|and) clinics?)?$/i.test(text) || (/camp/i.test(text) && text.length < 30)) cands.push(href);
    else if (/\/camps?(\/|$|\.aspx)|camps_home|sportscamps|\bcamps?\./i.test(href) && !/campus|campaign/i.test(href)) cands.push(href);
  }
  for (const href of cands) { try { return new URL(href, base).toString(); } catch { /* next */ } }
  return '';
}

/** The "Women's Soccer" link on an athletics home page. */
export function findSoccerLink(html, base) {
  for (const a of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (/^women'?s soccer$/i.test(strip(a[2])) && /\/sports\//.test(a[1])) { try { return new URL(decode(a[1]), base).toString(); } catch { /* next */ } }
  }
  return '';
}
