import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Mail, Copy, Save, RotateCcw, Trash2, AlertTriangle, ShieldCheck, Film, FileText, ExternalLink as Ext } from 'lucide-react';
import { rc, useRcMutation } from './api';
import { Btn, Chip, Field, Input, Select, Spinner, SchoolAvatar, C } from './ui';
import { fillPlaceholders, unresolved, highlightBlock, toReusable, buildMailto, emailAsText, copyText } from './lib/letters';

const draftKey = (programId) => `rc_draft_${programId}`;
const readDraft = (programId) => { try { return JSON.parse(localStorage.getItem(draftKey(programId)) || 'null'); } catch { return null; } };
const writeDraft = (programId, v) => { try { if (v) localStorage.setItem(draftKey(programId), JSON.stringify(v)); else localStorage.removeItem(draftKey(programId)); } catch { /* storage unavailable: the draft just isn't kept */ } };

const roleRank = (c) => (c.role === 'head' ? 0 : c.role === 'associate_head' ? 1 : /recruit/i.test(c.title || '') || c.role === 'recruiting_coordinator' ? 2 : 3);

/** The Contact Coach flow. Prepares an email for the athlete's own email app: nothing is ever sent from here. */
export default function ContactCoach({ program, onClose }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['rc', 'outreach', program.id], queryFn: () => rc.get(`/me/outreach/${program.id}`) });
  const coaches = useMemo(() => [...(data?.coaches || [])].sort((a, b) => roleRank(a) - roleRank(b) || (b.email_verified ? 1 : 0) - (a.email_verified ? 1 : 0)), [data]);
  const [coachId, setCoachId] = useState('');
  const [ref, setRef] = useState('');
  const [hlIds, setHlIds] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [base, setBase] = useState({ subject: '', body: '' }); // what the draft looked like when last (re)built from a template
  const [block, setBlock] = useState('');
  const [restored, setRestored] = useState(false);
  const [note, setNote] = useState('');
  const [draftId, setDraftId] = useState(null);
  const ready = useRef(false);
  const dialogRef = useRef(null);

  const coach = coaches.find((c) => c.id === coachId) || null;
  const chosen = useMemo(() => (data?.highlights || []).filter((h) => hlIds.includes(h.id)), [data, hlIds]);
  const templates = useMemo(() => {
    const map = new Map();
    for (const d of data?.defaults || []) map.set(`default:${d.key}`, { ref: `default:${d.key}`, name: d.name, subject: d.subject, body: d.body, isDefault: true });
    for (const t of data?.templates || []) map.set(`mine:${t.id}`, { ref: `mine:${t.id}`, name: t.name, subject: t.subject, body: t.body, id: t.id, basedOn: t.based_on_default });
    return map;
  }, [data]);
  const tpl = templates.get(ref) || null;

  const fieldsFor = (c, hls) => ({
    ...(data?.fields || {}), 'Coach First Name': c?.first_name || '', 'Coach Last Name': c?.last_name || '', 'Highlight Video Link': highlightBlock(hls),
  });
  const build = (t, c, hls) => {
    const f = fieldsFor(c, hls);
    return { subject: fillPlaceholders(t.subject, f), body: fillPlaceholders(t.body, f), block: highlightBlock(hls) };
  };
  const apply = (t, c, hls) => { const b = build(t, c, hls); setSubject(b.subject); setBody(b.body); setBlock(b.block); setBase({ subject: b.subject, body: b.body }); };

  // First load: pick the best coach, the first default, featured highlights; restore an unsent draft kept on this device.
  useEffect(() => {
    if (!data || ready.current) return;
    ready.current = true;
    const first = coaches[0] || null;
    const feat = data.highlights.filter((h) => h.featured).map((h) => h.id);
    const saved = readDraft(program.id);
    const firstRef = `default:${data.defaults[0].key}`;
    const startRef = saved && templates.has(saved.ref) ? saved.ref : firstRef;
    const startCoach = saved && coaches.some((c) => c.id === saved.coachId) ? saved.coachId : first?.id || '';
    const c = coaches.find((x) => x.id === startCoach) || null;
    const ids = saved ? (saved.hlIds || []).filter((id) => data.highlights.some((h) => h.id === id)) : feat;
    const hls = data.highlights.filter((h) => ids.includes(h.id));
    setCoachId(startCoach); setRef(startRef); setHlIds(ids);
    const b = build(templates.get(startRef), c, hls);
    setBase({ subject: b.subject, body: b.body }); setBlock(b.block);
    if (saved) { setSubject(saved.subject); setBody(saved.body); setRestored(true); } else { setSubject(b.subject); setBody(b.body); }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = ready.current && (subject !== base.subject || body !== base.body);
  useEffect(() => { if (ready.current) writeDraft(program.id, dirty ? { coachId, ref, hlIds, subject, body } : null); }, [dirty, coachId, ref, hlIds, subject, body, program.id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey); dialogRef.current?.focus();
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const record = useRcMutation((b) => rc.post('/me/outreach/drafts', { program_id: program.id, coach_id: coachId, template_ref: ref, subject, body, highlight_ids: hlIds, id: draftId, ...b }), { onSuccess: (r) => setDraftId(r.draft.id) });
  const saveTpl = useRcMutation((b) => (b.id ? rc.patch(`/me/letters/templates/${b.id}`, b) : rc.post('/me/letters/templates', b)));

  const pending = unresolved(subject, body);
  const mail = buildMailto(coach?.email_verified ? coach.email : '', subject, body);
  const canOpen = !!coach?.email_verified && !mail.tooLong && !!body.trim();
  const reusable = (s) => toReusable(s, { schoolName: program.school_name, coachFirst: coach?.first_name, coachLast: coach?.last_name, highlightText: block });

  const pickTemplate = (next) => {
    if (dirty && !window.confirm('Switching templates will replace your edits to this draft. Continue?')) return;
    setRef(next); apply(templates.get(next), coach, chosen); setRestored(false); setNote('');
  };
  const pickCoach = (id) => {
    const next = coaches.find((c) => c.id === id) || null;
    setCoachId(id);
    if (!dirty) { apply(tpl, next, chosen); return; }
    // keep the athlete's edits: just swap the previous coach's name for the new one
    const swap = (s) => { let out = s; if (coach?.last_name) out = out.split(coach.last_name).join(next?.last_name || '[Coach Last Name]'); if (coach?.first_name) out = out.split(coach.first_name).join(next?.first_name || '[Coach First Name]'); return out; };
    setSubject(swap(subject)); setBody(swap(body));
  };
  const toggleHl = (h) => {
    const ids = hlIds.includes(h.id) ? hlIds.filter((x) => x !== h.id) : [...hlIds, h.id];
    const hls = (data?.highlights || []).filter((x) => ids.includes(x.id));
    const nb = highlightBlock(hls);
    setHlIds(ids);
    if (!dirty) { apply(tpl, coach, hls); return; } // nothing of theirs to lose: rebuild from the template
    if (block && body.includes(block)) setBody(body.split(block).join(nb || '[Highlight Video Link]'));
    else if (nb && body.includes('[Highlight Video Link]')) setBody(body.replace('[Highlight Video Link]', nb));
    else if (nb) toast.message('Your message has no spot for the links now. Add them where you want them.');
    setBlock(nb);
  };

  const confirmPending = () => !pending.length || window.confirm(`These parts are still unfilled:\n\n${pending.join('\n')}\n\nContinue anyway?`);
  const openApp = () => {
    if (!canOpen || !confirmPending()) return;
    record.mutate({ status: 'email_app_opened' });
    setNote('Your email app should be opening with this message. Nothing has been sent: review it there and press Send yourself.');
    window.location.href = mail.url;
  };
  const copyEmail = async () => {
    if (!confirmPending()) return;
    const ok = await copyText(emailAsText(coach?.email_verified ? coach.email : '', subject, body));
    if (ok) { record.mutate({ status: 'copied' }); setNote('Copied. Paste it into your email app. Nothing has been sent.'); toast.success('Email copied'); } else toast.error('Could not copy. Select the message text and copy it manually.');
  };
  const saveToMine = async () => {
    if (!tpl?.id) return;
    if (!window.confirm(`Save these changes to your template “${tpl.name}”? ${program.school_name}-specific names are turned back into placeholders.`)) return;
    await saveTpl.mutateAsync({ id: tpl.id, name: tpl.name, subject: reusable(subject), body: reusable(body) });
    toast.success('Template updated'); setBase({ subject, body });
  };
  const saveAsNew = async () => {
    const name = window.prompt('Name for the new template:', `${tpl?.name || 'My letter'} (edited)`);
    if (!name) return;
    const r = await saveTpl.mutateAsync({ name, subject: reusable(subject), body: reusable(body) });
    toast.success('Saved as a new template'); setRef(`mine:${r.template.id}`); setBase({ subject, body });
  };
  const useDefault = () => {
    const d = tpl?.isDefault ? tpl : templates.get(`default:${tpl?.basedOn}`);
    if (!d) return;
    if (dirty && !window.confirm('Replace this draft with the original wording? Your saved templates are not changed.')) return;
    apply(d, coach, chosen); setRestored(false);
  };
  const discard = () => { if (!dirty || window.confirm('Discard your edits to this draft?')) { apply(tpl, coach, chosen); writeDraft(program.id, null); setRestored(false); } };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Contact ${program.school_name} coach`}
        className="w-full sm:max-w-3xl max-h-[96vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0d0e11] border border-[#BFA87C]/40 shadow-2xl outline-none">
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-5 py-3 bg-gradient-to-b from-[#660000] to-[#3d0000] border-b border-[#BFA87C]/40">
          <SchoolAvatar school={program} size="w-10 h-10" />
          <div className="min-w-0 flex-1"><div className="text-[11px] font-bold uppercase tracking-wider text-[#BFA87C]">Contact coach</div><div className="font-black text-white text-lg leading-tight truncate">{program.school_name}</div></div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 rounded-lg bg-black/30 hover:bg-black/50 text-white"><X className="w-5 h-5" /></button>
        </div>

        {isLoading && <div className="p-8 text-center"><Spinner className="w-6 h-6 mx-auto" /></div>}
        {error && <div className="p-5 text-red-300 text-sm">{error.message}</div>}
        {data && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-slate-300">
              This prepares an email for you. Nothing is sent from Pro IQ Recruits: you review it, open your own email app, and press Send yourself.
            </div>

            {!data.fields['Player Name'] && <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>Your profile has no name yet, so it can't fill in your details. <Link to="/profile" className="underline font-semibold">Complete your profile</Link>.</span></div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="1 · Coach">
                {coaches.length ? (
                  <Select value={coachId} onChange={(e) => pickCoach(e.target.value)}>
                    {coaches.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.title || 'Staff'}{c.email_verified ? '' : ' (no verified email)'}</option>)}
                  </Select>
                ) : <div className="text-sm text-amber-200">No coaches are listed for this school yet.</div>}
              </Field>
              <Field label="2 · Template">
                <Select value={ref} onChange={(e) => pickTemplate(e.target.value)}>
                  <optgroup label="Platform defaults">{data.defaults.map((d) => <option key={d.key} value={`default:${d.key}`}>{d.name}</option>)}</optgroup>
                  {data.templates.length > 0 && <optgroup label="My templates">{data.templates.map((t) => <option key={t.id} value={`mine:${t.id}`}>{t.name}</option>)}</optgroup>}
                </Select>
              </Field>
            </div>

            {tpl?.isDefault && <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">Using the original platform wording. <button type="button" className="text-red-400 font-semibold" onClick={saveAsNew}>Make my own copy</button></div>}

            <div className="rounded-xl border border-white/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white"><Film className="w-4 h-4 text-[#BFA87C]" />3 · Highlights to include</div>
              {data.highlights.length ? (
                <ul className="space-y-1.5">
                  {data.highlights.map((h) => (
                    <li key={h.id} className="flex items-start gap-2.5 text-sm">
                      <input id={`hl_${h.id}`} type="checkbox" className="mt-1 accent-red-600" checked={hlIds.includes(h.id)} onChange={() => toggleHl(h)} />
                      <label htmlFor={`hl_${h.id}`} className="min-w-0 flex-1"><span className="font-semibold text-white">{h.title}</span> <span className="text-slate-400">· {h.platform}</span></label>
                      <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Preview ${h.title}`} className="text-red-400 shrink-0 inline-flex items-center gap-1 text-xs font-semibold"><Ext className="w-3.5 h-3.5" />Preview</a>
                    </li>
                  ))}
                </ul>
              ) : <div className="text-sm text-slate-400">You haven't added any highlights yet.</div>}
              <Link to="/materials" className="text-xs text-red-400 font-semibold inline-block">Manage recruiting materials →</Link>
            </div>

            <div className="rounded-xl border border-white/10 p-3 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-white"><FileText className="w-4 h-4 text-[#BFA87C]" />4 · Review your email</div>
              <div className="text-sm rounded-lg bg-black/40 border border-white/10 px-3 py-2">
                <span className="text-slate-400">To: </span>
                {coach?.email_verified ? <><span className="text-white font-semibold break-all">{coach.email}</span> <Chip tone="lime" className="ml-1"><ShieldCheck className="w-3 h-3" />Verified contact</Chip></>
                  : <span className="text-amber-200">{coach ? 'No verified email for this coach' : 'Choose a coach'}</span>}
              </div>
              {coach && !coach.email_verified && (
                <div className="text-sm text-amber-100 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 space-y-1">
                  <div>We don't have a verified email for {coach.first_name} {coach.last_name}, so we won't guess one. Copy the message and send it through the school's official contact:</div>
                  <div className="flex flex-wrap gap-3">{data.program.contact_pages.map((c) => <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="text-red-300 font-semibold underline">{c.label} →</a>)}</div>
                </div>
              )}
              {restored && <div className="text-xs text-[#BFA87C]">Restored your unsent draft from this device. <button type="button" className="underline" onClick={discard}>Start over</button></div>}
              <Field label="Subject"><Input value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} /></Field>
              <Field label="Message"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className={`${C.input} leading-relaxed`} /></Field>
              {pending.length > 0 && (
                <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100" role="status">
                  <div className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Fill these in before you send ({pending.length}):</div>
                  <ul className="list-disc ml-5 mt-1">{pending.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              )}
              {mail.tooLong && <div className="text-sm text-amber-100">This message is too long for most email apps to open from a link. Use Copy Email instead.</div>}
              <div className="text-xs text-slate-500">Your edits here apply to this email only. {dirty ? 'Unsaved changes are kept on this device.' : ''}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Btn onClick={openApp} disabled={!canOpen || record.isPending} className="!bg-gradient-to-b !from-[#8a0f0f] !to-[#660000]"><Mail className="w-4 h-4" />Open Email App</Btn>
              <Btn variant="secondary" onClick={copyEmail}><Copy className="w-4 h-4" />Copy Email</Btn>
            </div>
            {note && <div className="text-sm text-[#BFA87C] rounded-lg border border-[#BFA87C]/30 px-3 py-2" role="status">{note}</div>}

            <div className="pt-3 border-t border-white/10 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Template actions</div>
              <div className="flex flex-wrap gap-2">
                <Btn size="sm" variant="secondary" disabled={!tpl?.id || !dirty || saveTpl.isPending} onClick={saveToMine}><Save className="w-4 h-4" />Save Changes to My Template</Btn>
                <Btn size="sm" variant="secondary" disabled={saveTpl.isPending} onClick={saveAsNew}><Save className="w-4 h-4" />Save as New Template</Btn>
                <Btn size="sm" variant="secondary" disabled={!tpl?.isDefault && !tpl?.basedOn} onClick={useDefault}><RotateCcw className="w-4 h-4" />Use Default Version</Btn>
                <Btn size="sm" variant="ghost" disabled={!dirty} onClick={discard}><Trash2 className="w-4 h-4" />Discard Draft Changes</Btn>
              </div>
              <div className="flex flex-wrap gap-4 text-xs"><Link to="/letters" className="text-red-400 font-semibold">Manage recruiting letters →</Link><Link to="/materials" className="text-red-400 font-semibold">Manage recruiting materials →</Link></div>
            </div>

            {data.drafts.length > 0 && (
              <div className="pt-3 border-t border-white/10 text-xs text-slate-400 space-y-1">
                <div className="font-bold uppercase tracking-wider">Earlier on this school</div>
                {data.drafts.slice(0, 3).map((d) => <div key={d.id}>{({ prepared: 'Prepared', email_app_opened: 'Opened in your email app', copied: 'Copied' })[d.status]}{d.coach_name ? ` · ${d.coach_name}` : ''} · {new Date(d.updated_date).toLocaleDateString()}</div>)}
                <div className="text-slate-500">These record what you did here. They can't confirm an email was actually sent.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
