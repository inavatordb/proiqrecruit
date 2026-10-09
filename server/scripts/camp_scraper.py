#!/usr/bin/env python3
"""
Women's soccer ID-camp scraper / enrichment for the Pro IQ Recruits directory.

Reads aggregator listings (collegeidcamps.net state pages, optional RSS/Atom feeds), resolves every school label to a stable
program_id from the seed directory, classifies each entry as an official school camp or a third-party event, and merges the result
into the seed CSVs the platform loads at boot. Nothing is guessed: a date or price that is missing, malformed, already past or
marked "check link" stays blank and the row goes to a review queue instead of the seed file.

  python server/scripts/camp_scraper.py --state arizona --dry-run
  python server/scripts/camp_scraper.py --state all --check-links
  python server/scripts/camp_scraper.py --feed https://example.org/camps.rss

Outputs (see --help for paths):
  server/seeds/recruiting/camps-aggregator.csv      dated, upcoming school camps   (platform "camps" import template)
  server/seeds/recruiting/idcamps-aggregator.csv    dated third-party events       (platform "idcamps" import template)
  data/import/camps/unmatched_camps.csv             school label did not resolve to a program at >= threshold
  data/import/camps/needs_review_camps.csv          matched school, but no usable date (missing / past / malformed / "check link")

Dependencies: Python 3.9+. Uses `requests` and `rapidfuzz` when installed, otherwise urllib and difflib (same results shape).
"""
from __future__ import annotations

import argparse
import csv
import difflib
import html
import re
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

try:  # optional accelerators
    import requests  # type: ignore
except ImportError:  # pragma: no cover
    requests = None
try:
    from rapidfuzz import fuzz  # type: ignore
except ImportError:  # pragma: no cover
    fuzz = None

ROOT = Path(__file__).resolve().parents[2]
SEEDS = ROOT / "server" / "seeds" / "recruiting"
REVIEW_DIR = ROOT / "data" / "import" / "camps"
BASE = "https://www.collegeidcamps.net"
UA = "Mozilla/5.0 (compatible; ProIQRecruitBot/1.0; +https://recruit-ousc.onrender.com)"

CAMPS_COLS = ["program_id", "camp_name", "camp_type", "start_date", "end_date", "registration_deadline", "location", "age_range",
              "grad_years", "cost", "registration_url", "official_url", "season", "source_url", "source_type", "verified",
              "last_verified_at", "notes"]
IDCAMP_COLS = ["program_id", "coach_id", "event_name", "organization", "event_date", "location", "event_type", "registration_url",
               "source_url", "source_type", "verified", "last_verified_at", "notes"]
UNMATCHED_COLS = ["state", "division", "label", "href", "raw_date", "best_guess", "confidence", "reason"]
REVIEW_COLS = ["program_id", "school_name", "state", "label", "href", "raw_date", "kind", "reason", "source_url"]

# Independent organisations that run multi-school showcases (host-name fragments).
INDEPENDENT_HOSTS = ("exactsports", "future500", "best90", "collegiatesoccerpanels", "topdrawersoccer", "sportsrecruits",
                     "soccerwire", "playerpath", "ecnl", "girlsacademyleague", "usyouthsoccer", "ncsasports")
INDEPENDENT_NAMES = {"exactsports": "EXACT Sports", "future500": "Future 500", "best90": "Best 90",
                     "collegiatesoccerpanels": "Collegiate Soccer Panels", "topdrawersoccer": "TopDrawerSoccer",
                     "sportsrecruits": "SportsRecruits", "ncsasports": "NCSA"}

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
MONTH_RE = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?"
DATE_TEXT = re.compile(MONTH_RE + r"\s+(\d{1,3})(?:\s*(?:-|–|—|to)\s*(?:" + MONTH_RE + r"\s+)?(\d{1,3}))?,?\s+(\d{4})", re.I)
DATE_NUM = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
COST_RE = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)")
AGE_RE = re.compile(r"\b(?:ages?|grades?|grad(?:uation)?(?: years?)?|classes? of)\s*[:\-]?\s*([\w\- ,&/]{2,40})", re.I)


# --------------------------------------------------------------------------------------------- HTTP
class Http:
    """Polite, retrying fetcher: one request per second, exponential backoff on 429/5xx, never raises."""

    def __init__(self, delay: float = 1.0, retries: int = 3) -> None:
        self.delay, self.retries, self._last = delay, retries, 0.0
        self.session = requests.Session() if requests else None
        if self.session:
            self.session.headers.update({"User-Agent": UA, "Accept": "text/html,application/xml;q=0.9,*/*;q=0.8"})

    def get(self, url: str) -> tuple[int, str, str]:
        """Returns (status, body, final_url); status 0 means the request itself failed."""
        status, body, final = 0, "", url
        for attempt in range(self.retries):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                if self.session:
                    r = self.session.get(url, timeout=30, allow_redirects=True)
                    status, body, final = r.status_code, r.content.decode("utf-8", "replace"), r.url
                else:
                    req = urllib.request.Request(url, headers={"User-Agent": UA})
                    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 (http(s) only, checked by caller)
                        status, body, final = r.status, r.read().decode("utf-8", "replace"), r.geturl()
            except Exception as exc:  # network error, TLS, HTTP error from urllib
                status = getattr(exc, "code", 0) or 0
                body = ""
            if status and status < 400:
                return status, body, final
            if status in (400, 401, 403, 404, 410):
                return status, "", final
            time.sleep(2 ** attempt)
        return status, "", final


# ------------------------------------------------------------------------------------- normalizers
def parse_dates(text: str, today: date) -> tuple[str, str, str]:
    """Best date range found in `text` -> (start, end, problem). Dates are ISO or '' ; problem explains a blank."""
    m = DATE_TEXT.search(text)
    if m:
        mon1 = MONTHS[m.group(1)[:3].lower()]
        d1, mon2, d2, year = int(m.group(2)), m.group(3), m.group(4), int(m.group(5))
        mon2n = MONTHS[mon2[:3].lower()] if mon2 else mon1
        try:
            start = date(year, mon1, d1)
            end = date(year, mon2n, int(d2)) if d2 else start
        except ValueError:
            return "", "", f'impossible date "{m.group(0)}"'
        if end < start:
            return "", "", f'end before start in "{m.group(0)}"'
        if end < today:
            return "", "", f"listed date {start.isoformat()} has passed"
        return start.isoformat(), end.isoformat(), ""
    m = DATE_NUM.search(text)
    if m:
        try:
            start = date(int(m.group(3)), int(m.group(1)), int(m.group(2)))
        except ValueError:
            return "", "", f'impossible date "{m.group(0)}"'
        return ("", "", f"listed date {start.isoformat()} has passed") if start < today else (start.isoformat(), start.isoformat(), "")
    return "", "", "no date listed" if not re.search(r"check link", text, re.I) else 'listing says "check link"'


def parse_cost(text: str) -> str:
    m = COST_RE.search(text)
    return f"${m.group(1)}" if m else ""


def parse_age(text: str) -> str:
    m = AGE_RE.search(text)
    return m.group(0).strip() if m else ""


def norm_name(s: str) -> str:
    s = html.unescape(s).lower().replace("&", " and ").replace("’", "'")
    s = re.sub(r"\bst\.?(?=\s|$)", "state", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    drop = {"the", "of", "university", "univ", "u", "college", "at", "and"}
    return " ".join(t for t in s.split() if t not in drop)


def reg_domain(url: str) -> str:
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


# --------------------------------------------------------------------------------- program directory
@dataclass
class Program:
    program_id: str
    school_name: str
    state: str = ""
    division: str = ""
    domains: set[str] = field(default_factory=set)
    norm: str = ""


def load_programs(seed_dir: Path) -> list[Program]:
    """Merges every programs-*.csv by program_id (later non-empty values win; all rows are women's soccer)."""
    by_id: dict[str, Program] = {}
    for f in sorted(seed_dir.glob("programs-*.csv")):
        with f.open(encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                pid = (row.get("program_id") or "").strip()
                name = (row.get("school_name") or "").strip()
                if not pid or not name:
                    continue
                p = by_id.setdefault(pid, Program(pid, name))
                p.state = (row.get("state") or p.state).strip()
                p.division = (row.get("division") or p.division).strip()
                for k in ("athletics_website", "soccer_website", "team_website", "camps_url"):
                    d = reg_domain(row.get(k) or "")
                    if d:
                        p.domains.add(d)
    progs = list(by_id.values())
    for p in progs:
        p.norm = norm_name(p.school_name)
    return progs


def score(a: str, b: str) -> float:
    if fuzz is not None:
        return float(fuzz.ratio(a, b))
    return difflib.SequenceMatcher(None, a, b).ratio() * 100


def resolve(label: str, progs: list[Program], threshold: float, state: str = "") -> tuple[Optional[Program], float, str, str]:
    """-> (program or None, confidence, best_guess_name, reason). Exact normalized equality is 100; ambiguity is rejected."""
    n = norm_name(label)
    if not n:
        return None, 0.0, "", "empty label"
    scored = []
    for p in progs:
        s = 100.0 if p.norm == n else score(n, p.norm)
        if ("state" in n.split()) != ("state" in p.norm.split()):
            s = min(s, 60.0)  # "Arizona" must never resolve to "Arizona State"
        scored.append((s, p))
    scored.sort(key=lambda x: -x[0])
    best_s, best = scored[0]
    guess = f"{best.school_name} ({best.program_id})"
    if best_s < threshold:
        return None, best_s, guess, f"best match {best_s:.0f}% is below {threshold:.0f}%"
    ties = [p for s, p in scored if s >= threshold and s >= best_s - 2 and p is not best]
    if ties:
        near = [p for p in ties if state and p.state == state]
        if state and best.state != state and len(near) == 1:
            return near[0], best_s, guess, ""
        if not (state and best.state == state and not near):
            return None, best_s, guess, "ambiguous between " + ", ".join(p.school_name for p in [best, *ties][:3])
    return best, best_s, guess, ""


# ----------------------------------------------------------------------------------------- parsing
@dataclass
class Listing:
    state: str
    division: str
    label: str
    href: str
    trailing: str
    source_url: str


class _Lines(HTMLParser):
    """Flattens the page's paragraph block into lines of (anchors, text), broken on <br>."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lines: list[tuple[list[tuple[str, str]], str]] = []
        self._anchors: list[tuple[str, str]] = []
        self._text: list[str] = []
        self._href: Optional[str] = None
        self._atext: list[str] = []
        self._skip = 0

    def _flush(self) -> None:
        text = re.sub(r"[\s​\xa0]+", " ", "".join(self._text)).strip()
        if self._anchors or text:
            self.lines.append((self._anchors, text))
        self._anchors, self._text = [], []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ("script", "style"):
            self._skip += 1
        elif tag == "br":
            self._flush()
        elif tag == "a":
            self._href, self._atext = dict(attrs).get("href") or "", []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self._skip = max(0, self._skip - 1)
        elif tag == "a" and self._href is not None:
            label = re.sub(r"[\s​ ﻿]+", " ", "".join(self._atext)).strip()
            if label:
                self._anchors.append((label, self._href))
            self._href = None
        elif tag in ("p", "div"):
            self._flush()

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        if self._href is not None:
            self._atext.append(data)
        else:
            self._text.append(data)


DIVISION_LINE = re.compile(r"^(D\s?[I1]{1,3}|D\s?[23]|NAIA|NJCAA|JUCO|NCAA D\w+)$", re.I)


def parse_state_page(page: str, state: str, url: str) -> list[Listing]:
    """Entries on a collegeidcamps.net state page: a division heading, then 'School link + date or "check link"' lines."""
    out: list[Listing] = []
    start = page.find("ID&nbsp;")
    heading = re.search(r"Women'?s Soccer ID", page)
    start = heading.start() if heading else max(0, start)
    block = page[start:]
    end = block.find("</td>")
    block = block[: end if end > 0 else len(block)]
    p = _Lines()
    p.feed(block)
    p._flush()
    division = ""
    for anchors, text in p.lines:
        if not anchors:
            if DIVISION_LINE.match(text.replace(" ", "")) or DIVISION_LINE.match(text):
                division = text.upper().replace(" ", "")
            continue
        label, href = anchors[0]
        if not href.lower().startswith(("http://", "https://")):
            continue
        out.append(Listing(state, division, label, href, text, url))
    return out


def parse_feed(xml_text: str, url: str) -> list[Listing]:
    """RSS 2.0 / Atom items -> listings. Title is read as 'School - Event' or 'School: Event'; the rest is trailing text."""
    out: list[Listing] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return out
    for item in list(root.iter("item")) + list(root.iter("{http://www.w3.org/2005/Atom}entry")):
        def tx(tag: str) -> str:
            el = item.find(tag) if item.find(tag) is not None else item.find("{http://www.w3.org/2005/Atom}" + tag)
            return (el.text or "").strip() if el is not None else ""
        link = tx("link")
        if not link:
            el = item.find("{http://www.w3.org/2005/Atom}link")
            link = el.get("href", "") if el is not None else ""
        title = html.unescape(tx("title"))
        school = re.split(r"\s+[-–—:|]\s+", title, maxsplit=1)[0]
        rest = " ".join([title, tx("pubDate"), re.sub(r"<[^>]+>", " ", html.unescape(tx("description")))])
        if link and school:
            out.append(Listing("", "", school, link, rest, url))
    return out


# -------------------------------------------------------------------------------------- classification
def host_org(href: str) -> str:
    host = (urlparse(href).hostname or "").lower()
    for frag in INDEPENDENT_HOSTS:
        if frag in host:
            return INDEPENDENT_NAMES.get(frag, frag)
    return ""


def link_confirms(http: Http, url: str, start: str) -> tuple[bool, str]:
    """Registration page loads and prints the camp's month and day. Returns (confirmed, final_url)."""
    status, body, final = http.get(url)
    if not body:
        return False, final
    text = re.sub(r"<[^>]+>", " ", html.unescape(body))
    y, m, d = (int(x) for x in start.split("-"))
    names = [k for k, v in MONTHS.items() if v == m][0]
    pat = re.compile(rf"\b{names}[a-z]*\.?\s+0?{d}\b|\b0?{m}/0?{d}/(?:{y}|{y % 100})\b", re.I)
    return bool(pat.search(text)), final


# ---------------------------------------------------------------------------------------- CSV merge
def read_rows(path: Path, cols: list[str]) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return [{c: (r.get(c) or "") for c in cols} for r in csv.DictReader(fh)]


def write_rows(path: Path, cols: list[str], rows: Iterable[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def upsert(existing: list[dict[str, str]], new: list[dict[str, str]], date_col: str) -> tuple[list[dict[str, str]], int, int]:
    """Dedupes on [program_id, start date, registration_url]; a repeat replaces the old row. Returns (rows, added, updated)."""
    key = lambda r: (r["program_id"], r[date_col], r["registration_url"].rstrip("/").lower())  # noqa: E731
    index = {key(r): i for i, r in enumerate(existing)}
    added = updated = 0
    for r in new:
        k = key(r)
        if k in index:
            if existing[index[k]] != r:
                existing[index[k]] = r
                updated += 1
        else:
            index[k] = len(existing)
            existing.append(r)
            added += 1
    return existing, added, updated


# ------------------------------------------------------------------------------------------- driver
def state_slugs(http: Http) -> list[str]:
    status, body, _ = http.get(BASE + "/womens-soccer.html")
    slugs = sorted(set(re.findall(r'href="/([a-z-]+)-womens-soccer-camps\.html"', body)))
    return slugs


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state", action="append", default=[], help='state slug, e.g. arizona, new-york; repeat, or "all"')
    ap.add_argument("--feed", action="append", default=[], help="RSS/Atom feed URL (best effort: titles read as 'School - Event')")
    ap.add_argument("--seed-dir", type=Path, default=SEEDS, help="where programs-*.csv live and the output seed CSVs are written")
    ap.add_argument("--review-dir", type=Path, default=REVIEW_DIR)
    ap.add_argument("--threshold", type=float, default=88.0, help="minimum fuzzy confidence (default 88)")
    ap.add_argument("--check-links", action="store_true", help="fetch each registration page; a camp is Verified only if it prints the date")
    ap.add_argument("--dry-run", action="store_true", help="print what would change; write nothing")
    ap.add_argument("--today", default="", help="override today's date (YYYY-MM-DD), for testing")
    a = ap.parse_args(argv)
    if not a.state and not a.feed:
        ap.error("give at least one --state or --feed")
    today = date.fromisoformat(a.today) if a.today else date.today()

    http = Http()
    progs = load_programs(a.seed_dir)
    if not progs:
        print(f"no programs found in {a.seed_dir}", file=sys.stderr)
        return 1
    states = a.state
    if "all" in states:
        states = state_slugs(http)

    listings: list[Listing] = []
    for s in states:
        url = f"{BASE}/{s}-womens-soccer-camps.html"
        status, body, _ = http.get(url)
        if not body:
            print(f"  {s}: could not load ({'HTTP ' + str(status) if status else 'network error'})", file=sys.stderr)
            continue
        found = parse_state_page(body, s.replace("-", " ").title(), url)
        print(f"  {s}: {len(found)} listings")
        listings += found
    for f in a.feed:
        status, body, _ = http.get(f)
        found = parse_feed(body, f) if body else []
        print(f"  feed {f}: {len(found)} items" + ("" if body else f" (could not load, HTTP {status})"))
        listings += found

    camps: list[dict[str, str]] = []
    appearances: list[dict[str, str]] = []
    unmatched: list[dict[str, str]] = []
    review: list[dict[str, str]] = []
    stamp = today.isoformat()
    for L in listings:
        raw_date = L.trailing
        prog, conf, guess, why = resolve(L.label, progs, a.threshold, L.state)
        if not prog:
            unmatched.append(dict(state=L.state, division=L.division, label=L.label, href=L.href, raw_date=raw_date,
                                  best_guess=guess, confidence=f"{conf:.0f}", reason=why))
            continue
        start, end, problem = parse_dates(raw_date, today)
        org = host_org(L.href)
        official = reg_domain(L.href) in prog.domains
        kind = "idcamps" if org else "camps"
        if not start:
            review.append(dict(program_id=prog.program_id, school_name=prog.school_name, state=L.state, label=L.label, href=L.href,
                               raw_date=raw_date, kind=kind, reason=problem, source_url=L.source_url))
            continue
        notes = [f'Listed on {urlparse(L.source_url).hostname} as "{L.label}"; school match {conf:.0f}%.']
        verified, source_url = "no", L.source_url
        if org:
            row = dict(program_id=prog.program_id, coach_id="", event_name=f"{org} showcase listing", organization=org, event_date=start,
                       location="", event_type="Showcase", registration_url=L.href, source_url=L.source_url, source_type="other",
                       verified="no", last_verified_at="", notes=" ".join(notes + ["Needs Review: aggregator listing only."]))
            appearances.append(row)
            continue
        if not official:
            notes.append("Camp site is not on a domain we have for this school; confirm it is the school's camp.")
        if a.check_links and official:
            ok, final = link_confirms(http, L.href, start)
            if ok:
                verified, source_url = "yes", final
                notes.append(f"Registration page prints the date (checked {stamp}).")
            else:
                notes.append("Registration page did not confirm the date.")
        cost, age = parse_cost(raw_date), parse_age(raw_date)
        camps.append(dict(program_id=prog.program_id, camp_name="Women's Soccer ID Camp", camp_type="ID Camp", start_date=start,
                          end_date=end if end != start else "", registration_deadline="", location="", age_range=age, grad_years="",
                          cost=cost, registration_url=L.href, official_url=L.href if official else "", season=start[:4],
                          source_url=source_url, source_type="other", verified=verified,
                          last_verified_at=stamp if verified == "yes" else "", notes=" ".join(notes)))

    camps_path, idc_path = a.seed_dir / "camps-aggregator.csv", a.seed_dir / "idcamps-aggregator.csv"
    merged_c, ac, uc = upsert(read_rows(camps_path, CAMPS_COLS), camps, "start_date")
    merged_i, ai, ui = upsert(read_rows(idc_path, IDCAMP_COLS), appearances, "event_date")
    print(f"\n{len(listings)} listings -> camps +{ac} ~{uc}, third-party events +{ai} ~{ui}, "
          f"needs-review (no usable date) {len(review)}, unmatched schools {len(unmatched)}")
    for r in review[:10]:
        print(f"  review: {r['school_name']}: {r['reason']}")
    for r in unmatched[:10]:
        print(f"  unmatched: {r['label']!r} ({r['reason']})")
    if a.dry_run:
        print("dry run: nothing written")
        return 0
    if merged_c:  # a header-only seed file would be rejected by the loader
        write_rows(camps_path, CAMPS_COLS, merged_c)
    if merged_i:
        write_rows(idc_path, IDCAMP_COLS, merged_i)
    um_path, rv_path = a.review_dir / "unmatched_camps.csv", a.review_dir / "needs_review_camps.csv"
    # review queues are rebuilt per run for the states scanned, other states' rows are kept
    scanned = {L.state for L in listings}
    keep_u = [r for r in read_rows(um_path, UNMATCHED_COLS) if r["state"] not in scanned]
    keep_r = [r for r in read_rows(rv_path, REVIEW_COLS) if r["state"] not in scanned]
    write_rows(um_path, UNMATCHED_COLS, keep_u + unmatched)
    write_rows(rv_path, REVIEW_COLS, keep_r + review)
    return 0


if __name__ == "__main__":
    sys.exit(main())
