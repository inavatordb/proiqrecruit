/**
 * Recruiting outreach: highlights, the athlete's letter library, and email *preparation* records.
 *
 * Nothing here sends email. A draft row only records that an email was prepared, that the athlete's own email app was opened with it,
 * or that it was copied -- never that it was sent, because the platform has no way to know.
 *
 * Every row is scoped to the signed-in athlete's profile (profile_id). Platform default templates are constants (letters.mjs):
 * copies are separate rows, so editing a copy cannot touch the default or anyone else's copy.
 */
import { DEFAULT_TEMPLATES, DEFAULTS_VERSION, defaultByKey, KNOWN_PLACEHOLDERS, PERSONAL_PLACEHOLDERS } from './letters.mjs';
import { str, text, safeUrl, toList, toInt, toDate, toBool } from './core.mjs';

export const MAX_HIGHLIGHTS = 40;
export const MAX_TEMPLATES = 60;
const MAX_DRAFTS = 200;
export const DRAFT_STATUSES = ['prepared', 'email_app_opened', 'copied'];

const POSITION_NAMES = {
  GK: 'goalkeeper', CB: 'center back', LB: 'left back', RB: 'right back', WB: 'wing back', CDM: 'defensive midfielder', CM: 'central midfielder',
  CAM: 'attacking midfielder', LM: 'left midfielder', RM: 'right midfielder', LW: 'left winger', RW: 'right winger', ST: 'striker', CF: 'center forward',
};
const PLATFORMS = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'], [/(^|\.)vimeo\.com$/, 'Vimeo'], [/(^|\.)hudl\.com$/, 'Hudl'],
  [/(^|\.)(veo\.co|veo\.com)$/, 'Veo'], [/(^|\.)(drive\.google\.com)$/, 'Google Drive'], [/(^|\.)(dropbox\.com)$/, 'Dropbox'],
  [/(^|\.)(instagram\.com|tiktok\.com)$/, 'Social video'],
];
export const platformOf = (url) => {
  try { const h = new URL(url).hostname.toLowerCase(); return PLATFORMS.find(([re]) => re.test(h))?.[1] || 'Video link'; } catch { return 'Video link'; }
};

export function createOutreach({ rows, getRow, putRow, delRow, profileFor, programOf, coachesFor, newId, now, httpErr, logActivity }) {
  const mineOf = (entity, profile) => rows(entity).filter((r) => r.profile_id === profile.id);
  const owned = (entity, user, id) => {
    const profile = profileFor(user, { create: false });
    const r = getRow(entity, id);
    return profile && r && r.profile_id === profile.id ? r : null;
  };

  /* -------------------------------- highlights -------------------------------- */
  const sortHighlights = (list) => list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || a.created_date.localeCompare(b.created_date));

  function highlightFields(body, prev = {}) {
    const url = safeUrl(body.url ?? prev.url);
    if (!url || !/^https:\/\//i.test(url)) throw httpErr(400, 'Add a link that starts with https:// (YouTube, Hudl, Vimeo or another video site).');
    const title = str(body.title ?? prev.title, 120);
    if (!title) throw httpErr(400, 'Give the highlight a title.');
    return {
      title, url, platform: platformOf(url), description: text(body.description ?? prev.description ?? '', 600),
      position: str(body.position ?? prev.position ?? '', 20).toUpperCase(), grad_year: toInt(body.grad_year ?? prev.grad_year),
      highlight_date: toDate(body.highlight_date ?? prev.highlight_date) || '', tags: (Array.isArray(body.tags ?? prev.tags) ? (body.tags ?? prev.tags) : String(body.tags ?? prev.tags ?? '').split(',')).map((t) => str(t, 30).trim()).filter(Boolean).slice(0, 8),
      featured: body.featured === undefined ? !!prev.featured : toBool(body.featured),
    };
  }
  function listHighlights(user) {
    const profile = profileFor(user);
    return sortHighlights(mineOf('RecruitHighlight', profile));
  }
  function addHighlight(user, body) {
    const profile = profileFor(user);
    const mine = mineOf('RecruitHighlight', profile);
    if (mine.length >= MAX_HIGHLIGHTS) throw httpErr(400, `You can keep up to ${MAX_HIGHLIGHTS} highlights. Remove one first.`);
    return putRow('RecruitHighlight', {
      id: newId('rhl'), created_date: now(), updated_date: now(), profile_id: profile.id, ...highlightFields(body),
      sort_order: mine.reduce((m, h) => Math.max(m, h.sort_order ?? 0), 0) + 1,
    });
  }
  function updateHighlight(user, id, body) {
    const h = owned('RecruitHighlight', user, id); if (!h) throw httpErr(404, 'Not found.');
    return putRow('RecruitHighlight', { ...h, ...highlightFields(body, h), updated_date: now() });
  }
  function deleteHighlight(user, id) { if (!owned('RecruitHighlight', user, id)) throw httpErr(404, 'Not found.'); return delRow('RecruitHighlight', id); }
  function reorderHighlights(user, ids) {
    const profile = profileFor(user);
    const mine = new Map(mineOf('RecruitHighlight', profile).map((h) => [h.id, h]));
    (Array.isArray(ids) ? ids : []).filter((id) => mine.has(id)).forEach((id, i) => { const h = mine.get(id); if (h.sort_order !== i + 1) putRow('RecruitHighlight', { ...h, sort_order: i + 1, updated_date: now() }); });
    return listHighlights(user);
  }

  /* --------------------------------- templates --------------------------------- */
  const publicDefault = (t) => ({ ...t, id: `default:${t.key}`, is_default: true, version: DEFAULTS_VERSION });

  function templateFields(body, prev = {}) {
    const name = str(body.name ?? prev.name, 80);
    const subject = str(body.subject ?? prev.subject, 200);
    const msg = text(body.body ?? prev.body, 6000);
    if (!name) throw httpErr(400, 'Name your template.');
    if (!msg) throw httpErr(400, 'The message cannot be empty.');
    return { name, subject, body: msg };
  }
  function lettersFor(user) {
    const profile = profileFor(user);
    return {
      defaults: DEFAULT_TEMPLATES.map(publicDefault),
      templates: mineOf('RecruitLetterTemplate', profile).sort((a, b) => b.updated_date.localeCompare(a.updated_date)),
      placeholders: { known: KNOWN_PLACEHOLDERS, personal: PERSONAL_PLACEHOLDERS },
    };
  }
  /** Creates the athlete's OWN row: a copy of a platform default (`based_on`), a copy of one of their templates, or a blank template. */
  function createTemplate(user, body) {
    const profile = profileFor(user);
    const mine = mineOf('RecruitLetterTemplate', profile);
    if (mine.length >= MAX_TEMPLATES) throw httpErr(400, `You can keep up to ${MAX_TEMPLATES} templates. Delete one first.`);
    let seed = {}; let based = {};
    if (body.based_on_default) {
      const d = defaultByKey(String(body.based_on_default)); if (!d) throw httpErr(404, 'Unknown default template.');
      seed = { name: `${d.name} (my version)`, subject: d.subject, body: d.body }; based = { based_on_default: d.key, based_on_version: DEFAULTS_VERSION };
    } else if (body.copy_of) {
      const src = owned('RecruitLetterTemplate', user, String(body.copy_of)); if (!src) throw httpErr(404, 'Template not found.');
      seed = { name: `${src.name} (copy)`, subject: src.subject, body: src.body }; based = { based_on_default: src.based_on_default || '', based_on_version: src.based_on_version || null };
    }
    const f = templateFields({ ...seed, ...body });
    return putRow('RecruitLetterTemplate', { id: newId('rlt'), created_date: now(), updated_date: now(), profile_id: profile.id, ...f, based_on_default: '', based_on_version: null, ...based });
  }
  function updateTemplate(user, id, body) {
    const t = owned('RecruitLetterTemplate', user, id); if (!t) throw httpErr(404, 'Not found.');
    return putRow('RecruitLetterTemplate', { ...t, ...templateFields(body, t), updated_date: now() });
  }
  function deleteTemplate(user, id) { if (!owned('RecruitLetterTemplate', user, id)) throw httpErr(404, 'Not found.'); return delRow('RecruitLetterTemplate', id); }

  /* ---------------------------------- compose ---------------------------------- */
  function composeData(user, programId) {
    const profile = profileFor(user);
    const program = programOf(programId);
    if (!program) throw httpErr(404, 'School not found.');
    const coaches = coachesFor(program.id).map((c) => ({
      id: c.id, first_name: c.first_name, last_name: c.last_name, title: c.title || '', role: c.role,
      email: c.email || '', email_verified: !!c.email && c.verification_status === 'verified',
    }));
    const pos = profile.primary_position || (profile.positions || [])[0] || '';
    const team = profile.club || profile.high_school || '';
    const contactBits = [profile.email ? `Email: ${profile.email}` : '', profile.phone ? `Phone: ${profile.phone}` : ''].filter(Boolean);
    const lets = lettersFor(user);
    return {
      program: {
        id: program.id, slug: program.slug, school_name: program.school_name, division: program.division, logo_url: program.logo_url || '',
        contact_pages: [['Soccer program page', program.team_website], ['Athletics site', program.athletics_website]].filter(([, u]) => u).map(([label, url]) => ({ label, url })),
      },
      coaches,
      fields: {
        'College Name': program.school_name,
        'Player Name': profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(' '),
        'Graduation Year': profile.grad_year ? String(profile.grad_year) : '',
        'Position': POSITION_NAMES[pos] || pos.toLowerCase(),
        'Club or High School Team': team,
        'Academic Interests': (profile.academic_interests || []).join(', '),
        'Player Contact Information': contactBits.join(' · '),
      },
      highlights: listHighlights(user),
      defaults: lets.defaults, templates: lets.templates, placeholders: lets.placeholders,
      drafts: mineOf('RecruitOutreachDraft', profile).filter((d) => d.program_id === program.id).sort((a, b) => b.updated_date.localeCompare(a.updated_date)).slice(0, 10),
    };
  }

  /* ----------------------------- preparation history ----------------------------- */
  function saveDraft(user, body) {
    const profile = profileFor(user);
    const program = programOf(str(body.program_id, 120)); if (!program) throw httpErr(404, 'School not found.');
    const status = DRAFT_STATUSES.includes(body.status) ? body.status : 'prepared';
    const coach = coachesFor(program.id).find((c) => c.id === body.coach_id) || null;
    const prev = body.id ? owned('RecruitOutreachDraft', user, String(body.id)) : null;
    const rec = {
      id: prev?.id || newId('rod'), created_date: prev?.created_date || now(), updated_date: now(), profile_id: profile.id, program_id: program.id,
      coach_id: coach?.id || '', coach_name: coach ? `${coach.first_name} ${coach.last_name}` : '',
      to_email: coach && coach.email && coach.verification_status === 'verified' ? coach.email : '',
      template_ref: str(body.template_ref, 80), subject: str(body.subject, 300), body: text(body.body, 8000),
      highlight_ids: toList(body.highlight_ids).slice(0, 10), status,
      // Always false: the platform cannot observe a send. Kept explicit so no screen ever has to guess.
      send_confirmed: false,
    };
    putRow('RecruitOutreachDraft', rec);
    logActivity?.(profile, status === 'prepared' ? 'prepared_email' : status === 'copied' ? 'copied_email' : 'opened_email_app', program);
    const all = mineOf('RecruitOutreachDraft', profile).sort((a, b) => b.updated_date.localeCompare(a.updated_date));
    for (const old of all.slice(MAX_DRAFTS)) delRow('RecruitOutreachDraft', old.id);
    return rec;
  }
  function deleteDraft(user, id) { if (!owned('RecruitOutreachDraft', user, id)) throw httpErr(404, 'Not found.'); return delRow('RecruitOutreachDraft', id); }

  return {
    listHighlights, addHighlight, updateHighlight, deleteHighlight, reorderHighlights,
    lettersFor, createTemplate, updateTemplate, deleteTemplate, composeData, saveDraft, deleteDraft,
  };
}
