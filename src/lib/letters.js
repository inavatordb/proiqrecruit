/** Helpers for the Contact Coach composer. Pure functions; nothing here talks to the network or sends anything. */

export const PLACEHOLDER_RE = /\[[^\]\n]{2,80}\]/g;
/** Conservative length for a mailto: link; many email apps and browsers truncate or refuse longer ones. */
export const MAILTO_LIMIT = 1900;

/** Replaces `[Name]` with its value when one is known; leaves unknown or empty placeholders untouched so they get flagged. */
export function fillPlaceholders(text, fields) {
  return String(text || '').replace(PLACEHOLDER_RE, (m) => {
    const v = fields[m.slice(1, -1)];
    return v ? v : m;
  });
}

/** The distinct `[Placeholders]` still in the text, in order of appearance. */
export function unresolved(...texts) {
  const seen = new Set();
  for (const t of texts) for (const m of String(t || '').match(PLACEHOLDER_RE) || []) seen.add(m);
  return [...seen];
}

/** Highlights as plain-text lines an email can carry. */
export function highlightBlock(highlights) {
  return highlights.map((h) => `${h.title}: ${h.url}`).join('\n');
}

/**
 * Turns school/coach-specific text in a finished draft back into placeholders, so a draft written for one school can be saved as a
 * reusable template without baking that school's name into it.
 */
export function toReusable(text, { schoolName, coachFirst, coachLast, highlightText }) {
  let out = String(text || '');
  const swap = (value, token) => { if (value && value.length > 2) out = out.split(value).join(token); };
  swap(highlightText, '[Highlight Video Link]');
  swap(schoolName, '[College Name]');
  swap(coachLast, '[Coach Last Name]');
  swap(coachFirst, '[Coach First Name]');
  return out;
}

/** `mailto:` link with safely encoded subject and body. `tooLong` means: use Copy Email instead. */
export function buildMailto(to, subject, body) {
  const url = `mailto:${encodeURIComponent(to || '').replace(/%40/g, '@')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(String(body || '').replace(/\r?\n/g, '\r\n'))}`;
  return { url, tooLong: url.length > MAILTO_LIMIT };
}

export const emailAsText = (to, subject, body) => `${to ? `To: ${to}\n` : ''}Subject: ${subject}\n\n${body}`;

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
