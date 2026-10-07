/**
 * Builds the bundled program seed CSVs for the recruiting platform.
 *
 *   node server/scripts/build-recruiting-programs.mjs
 *
 * Source: Wikipedia's "List of NCAA Division I/II women's soccer programs",
 * which itself cites the NCAA's institution directory
 * (web3.ncaa.org/directory, sport code WSO). It is re-runnable: run it again
 * after a season and re-import the CSVs from Admin > Imports. Nothing here
 * invents data -- a column the source does not carry (websites, coaches,
 * records) is left blank for the other importers or an admin to fill.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { regionForState, toCsv } from '../recruiting/core.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'recruiting');
const UA = 'HoursOfGamesRecruiting/1.0 (darisbrownseo@gmail.com)';

const SOURCES = [
  { division: 'D1', title: "List_of_NCAA_Division_I_women's_soccer_programs", stop: '==Scheduled additions==',
    ncaa: 'https://web3.ncaa.org/directory/memberList?type=12&division=I&sportCode=WSO' },
  { division: 'D2', title: "List_of_NCAA_Division_II_women's_soccer_programs", stop: '==Future Division II',
    ncaa: 'https://web3.ncaa.org/directory/memberList?type=12&division=II&sportCode=WSO' },
];

function stripBraces(s) {
  // {{efn|...}} and {{sort|a|b}} can nest; peel innermost-first.
  let prev;
  do {
    prev = s;
    s = s.replace(/\{\{sortname\|([^|{}]*)\|([^|{}]*)[^{}]*\}\}/gi, '$1 $2')
      .replace(/\{\{sort\|[^|{}]*\|([^{}]*)\}\}/gi, '$1').replace(/\{\{[^{}]*\}\}/g, '');
  } while (s !== prev);
  return s;
}

/** [[Target|Shown]] -> {text: Shown, target: Target} */
function linkParts(cell) {
  const m = cell.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  return m ? { target: m[1].trim(), text: (m[2] || m[1]).trim() } : { target: '', text: '' };
}

function plain(cell) {
  return stripBraces(cell)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>.*?<\/ref>/gs, '').replace(/<ref[^>]*\/>/g, '')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '').replace(/\s+/g, ' ').trim();
}

function parseTable(wikitext) {
  const rows = [];
  for (const chunk of wikitext.split(/\n\|-[^\n]*\n/)) {
    const cells = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('|') && !line.startsWith('|}') && !line.startsWith('{|')) cells.push(line.slice(1).trim());
      else if (cells.length && !line.startsWith('!') && !line.startsWith('{|') && line.trim()) cells[cells.length - 1] += ' ' + line.trim();
    }
    if (cells.length >= 5) rows.push(cells);
  }
  return rows;
}

const conf = (cell) => {
  const l = linkParts(stripBraces(cell));
  const name = (l.target || plain(cell)).replace(/\s*\(.*?\)\s*$/, '').replace(/#.*$/, '');
  return /independent/i.test(name) ? 'Independent' : name;
};

async function build({ division, title, stop, ncaa }) {
  const url = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);
  let text = await res.text();
  text = text.slice(text.indexOf('{|'), text.indexOf(stop) > 0 ? text.indexOf(stop) : undefined);
  const out = [];
  for (const c of parseTable(text)) {
    let school; let nickname; let city; let state; let type = ''; let conference;
    if (division === 'D1') { // Institution | Location | State | Type | Nickname | Conference
      [school, city, state, type, nickname, conference] = [c[0], c[1], c[2], c[3], c[4], c[5]];
    } else { // School | Nickname | City | State | Conference | Note
      [school, nickname, city, state, conference] = [c[0], c[1], c[2], c[3], c[4]];
    }
    if (!school || !conference) continue;
    const official = linkParts(stripBraces(school)).target || plain(school);
    const shortName = plain(school);
    const stateName = plain(state).replace(/^District of Columbia$/, 'District of Columbia');
    out.push({
      sport: 'womens-soccer', division,
      school_name: shortName,
      official_school_name: official.replace(/\s*\(.*?\)\s*$/, ''),
      nickname: plain(nickname),
      conference: conf(conference),
      city: plain(city),
      state: stateName,
      region: regionForState(stateName),
      public_private: /public/i.test(type) ? 'Public' : /private/i.test(type) ? 'Private' : '',
      school_type: /service/i.test(type) ? 'Service Academy' : '',
      source_url: ncaa,
      source_name: 'NCAA institution directory (via Wikipedia list)',
    });
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
for (const src of SOURCES) {
  const rows = await build(src);
  const file = path.join(OUT, `programs-${src.division.toLowerCase()}.csv`);
  fs.writeFileSync(file, toCsv(rows));
  console.log(`${src.division}: ${rows.length} programs -> ${file}`);
}
