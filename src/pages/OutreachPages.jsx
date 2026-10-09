import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUp, ArrowDown, Star, Trash2, Pencil, Video, ExternalLink as Ext, Copy, FilePlus2, Eye, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { rc, useRcMutation } from '../api';
import { C, Btn, Chip, Field, Input, Textarea, Select, Loading, ErrorBox, Empty, Section, Spinner } from '../ui';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'WB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'];
const GOLD = 'text-[#BFA87C]';

function SignedOut({ what }) {
  return (
    <div className="max-w-md mx-auto text-center space-y-4 py-10">
      <h1 className="text-3xl font-black">{what}</h1>
      <p className="text-slate-400">Sign in to manage your recruiting materials.</p>
      <Link to={`/auth?next=${encodeURIComponent(window.location.pathname)}`}><Btn size="lg">Sign in</Btn></Link>
    </div>
  );
}

const PageHead = ({ title, children }) => (
  <div className="space-y-1">
    <Link to="/profile" className="text-sm text-red-400 font-semibold">← Profile</Link>
    <h1 className="text-3xl font-black tracking-tight">{title}</h1>
    {children && <p className="text-slate-400 text-sm max-w-2xl">{children}</p>}
  </div>
);

/* ------------------------------ Recruiting Materials ------------------------------ */
const blankHl = { title: '', url: '', description: '', position: '', grad_year: '', highlight_date: '', tags: '' };

export function MaterialsPage() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['rc', 'highlights'], queryFn: () => rc.get('/me/highlights'), enabled: isAuthenticated });
  const [form, setForm] = useState(null); // null = closed, else the form being edited
  const save = useRcMutation((f) => (f.id ? rc.patch(`/me/highlights/${f.id}`, f) : rc.post('/me/highlights', f)), { onSuccess: () => { toast.success('Highlight saved'); setForm(null); } });
  const del = useRcMutation((id) => rc.del(`/me/highlights/${id}`), { onSuccess: () => toast.success('Highlight removed') });
  const feature = useRcMutation((h) => rc.patch(`/me/highlights/${h.id}`, { featured: !h.featured }));
  const reorder = useRcMutation((ids) => rc.put('/me/highlights/order', { ids }));
  if (!isAuthenticated) return <SignedOut what="Recruiting materials" />;
  const list = data?.highlights || [];
  const move = (i, d) => { const ids = list.map((h) => h.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder.mutate(ids); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <PageHead title="Recruiting materials">Add links to your highlight videos on Hudl, YouTube, Vimeo or another video site. You choose which ones go into each email to a coach.</PageHead>
      <div className={`${C.card} p-4 text-sm text-slate-300 flex gap-3`}>
        <Video className={`w-5 h-5 shrink-0 ${GOLD}`} />
        <div>Direct video uploads aren't available yet because the platform has no video storage. Upload your reel to Hudl, YouTube or Vimeo, then paste the link here.</div>
      </div>
      <ErrorBox error={error} />
      {!form && <Btn onClick={() => setForm({ ...blankHl })}><FilePlus2 className="w-4 h-4" />Add a highlight</Btn>}
      {form && (
        <form className={`${C.card} p-4 space-y-3 border-[#BFA87C]/30`} onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
          <div className="font-black text-white">{form.id ? 'Edit highlight' : 'New highlight'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Title"><Input required maxLength={120} value={form.title} onChange={set('title')} placeholder="Fall 2026 season highlights" /></Field>
            <Field label="Video link" hint="Must start with https://"><Input required type="url" value={form.url} onChange={set('url')} placeholder="https://www.hudl.com/…" /></Field>
            <Field label="Position"><Select value={form.position} onChange={set('position')}><option value="">—</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Graduation year"><Input type="number" min="2025" max="2035" value={form.grad_year || ''} onChange={set('grad_year')} /></Field>
            <Field label="Date of footage"><Input type="date" value={form.highlight_date || ''} onChange={set('highlight_date')} /></Field>
            <Field label="Tags" hint="Separate with commas"><Input value={Array.isArray(form.tags) ? form.tags.join(', ') : form.tags} onChange={set('tags')} placeholder="goals, defending" /></Field>
          </div>
          <Field label="Description (optional)"><Textarea rows={2} maxLength={600} value={form.description} onChange={set('description')} /></Field>
          <div className="flex gap-2"><Btn type="submit" disabled={save.isPending}>{save.isPending && <Spinner className="w-4 h-4" />}Save highlight</Btn><Btn type="button" variant="ghost" onClick={() => setForm(null)}>Cancel</Btn></div>
        </form>
      )}
      {isLoading ? <Loading /> : list.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map((h, i) => (
            <div key={h.id} className={`${C.card} p-4 space-y-2.5`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-black text-white text-lg leading-tight break-words">{h.title}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5"><Chip>{h.platform}</Chip>{h.featured && <Chip tone="amber"><Star className="w-3 h-3" />Featured</Chip>}{h.position && <Chip>{h.position}</Chip>}{h.grad_year && <Chip>Class of {h.grad_year}</Chip>}{h.tags?.map((t) => <Chip key={t}>{t}</Chip>)}</div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button type="button" aria-label="Move up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} className="p-1.5 rounded bg-white/5 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                  <button type="button" aria-label="Move down" disabled={i === list.length - 1 || reorder.isPending} onClick={() => move(i, 1)} className="p-1.5 rounded bg-white/5 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                </div>
              </div>
              {h.description && <p className="text-sm text-slate-400">{h.description}</p>}
              <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-red-400 font-semibold inline-flex items-center gap-1 break-all"><Ext className="w-3.5 h-3.5 shrink-0" />{h.url.replace(/^https?:\/\//, '').slice(0, 60)}</a>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                <Btn size="sm" variant="secondary" onClick={() => feature.mutate(h)}><Star className="w-4 h-4" />{h.featured ? 'Unfeature' : 'Feature'}</Btn>
                <Btn size="sm" variant="secondary" onClick={() => setForm({ ...h })}><Pencil className="w-4 h-4" />Edit</Btn>
                <Btn size="sm" variant="ghost" className="!text-red-300" onClick={() => { if (window.confirm(`Remove “${h.title}”?`)) del.mutate(h.id); }}><Trash2 className="w-4 h-4" />Remove</Btn>
              </div>
            </div>
          ))}
        </div>
      ) : !form && <Empty title="No highlights yet">Add your first link, then pick it when you contact a coach.</Empty>}
    </div>
  );
}

/* -------------------------------- Recruiting Letters -------------------------------- */
function Preview({ t, onClose }) {
  return (
    <div className={`${C.card} p-4 space-y-2 border-[#BFA87C]/30`}>
      <div className="flex justify-between items-start gap-2"><div className="font-black text-white">{t.name}</div><button type="button" onClick={onClose} className="text-sm text-slate-400">Close</button></div>
      <div className="text-sm"><span className="text-slate-400">Subject: </span>{t.subject}</div>
      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 bg-black/30 border border-white/10 rounded-lg p-3">{t.body}</pre>
      <div className="text-xs text-slate-500">Text in [brackets] is filled in automatically or by you when you contact a coach.</div>
    </div>
  );
}

export function PlaceholderPicker({ placeholders, onInsert }) {
  const all = [...(placeholders?.known || []), ...(placeholders?.personal || [])];
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Insert a personalization field">
      {all.map((p) => <button key={p} type="button" onClick={() => onInsert(`[${p}]`)} className="rounded-full bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 text-xs text-slate-200">+ {p}</button>)}
    </div>
  );
}

export function LettersPage() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['rc', 'letters'], queryFn: () => rc.get('/me/letters'), enabled: isAuthenticated });
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const bodyRef = React.useRef(null);
  const create = useRcMutation((b) => rc.post('/me/letters/templates', b), { onSuccess: (r) => { toast.success('Saved to your templates'); setEdit({ ...r.template }); } });
  const update = useRcMutation((t) => rc.patch(`/me/letters/templates/${t.id}`, t), { onSuccess: () => { toast.success('Template saved'); setEdit(null); } });
  const del = useRcMutation((id) => rc.del(`/me/letters/templates/${id}`), { onSuccess: () => toast.success('Template deleted') });
  if (!isAuthenticated) return <SignedOut what="Recruiting letters" />;
  const defaults = data?.defaults || []; const mine = data?.templates || [];
  const defaultOf = (t) => defaults.find((d) => d.key === t.based_on_default);
  const insert = (token) => {
    const el = bodyRef.current;
    setEdit((t) => {
      const at = el ? el.selectionStart : t.body.length;
      return { ...t, body: `${t.body.slice(0, at)}${token}${t.body.slice(el ? el.selectionEnd : at)}` };
    });
  };

  return (
    <div className="space-y-6">
      <PageHead title="Recruiting letters">Five starting letters are provided. Make your own copy to change the wording; the originals never change. Your templates are private to you.</PageHead>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : (<>
        {edit && (
          <form className={`${C.card} p-4 space-y-3 border-[#BFA87C]/30`} onSubmit={(e) => { e.preventDefault(); update.mutate(edit); }}>
            <div className="font-black text-white">Edit “{edit.name}”</div>
            <Field label="Template name"><Input required maxLength={80} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Subject line"><Input maxLength={200} value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></Field>
            <Field label="Message"><textarea ref={bodyRef} required rows={14} maxLength={6000} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} className={C.input} /></Field>
            <PlaceholderPicker placeholders={data?.placeholders} onInsert={insert} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Btn type="submit" disabled={update.isPending}>{update.isPending && <Spinner className="w-4 h-4" />}Save template</Btn>
              {defaultOf(edit) && <Btn type="button" variant="secondary" onClick={() => { const d = defaultOf(edit); setEdit({ ...edit, subject: d.subject, body: d.body }); toast.message('Default wording loaded. Press Save to keep it.'); }}><RotateCcw className="w-4 h-4" />Use default wording</Btn>}
              <Btn type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</Btn>
            </div>
          </form>
        )}
        {view && <Preview t={view} onClose={() => setView(null)} />}

        <Section title="My templates" action={<Btn size="sm" variant="secondary" onClick={() => create.mutate({ name: 'New template', subject: '', body: 'Dear Coach [Coach Last Name],\n\n' })}><FilePlus2 className="w-4 h-4" />New from scratch</Btn>}>
          {mine.length ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {mine.map((t) => (
                <div key={t.id} className={`${C.card} p-4 space-y-2`}>
                  <div className="font-black text-white text-lg leading-tight">{t.name}</div>
                  <div className="text-xs text-slate-400">{defaultOf(t) ? `Based on “${defaultOf(t).name}”` : 'Written from scratch'}</div>
                  <div className="text-sm text-slate-300 line-clamp-2">{t.subject || '(no subject)'}</div>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                    <Btn size="sm" variant="secondary" onClick={() => setEdit({ ...t })}><Pencil className="w-4 h-4" />Edit</Btn>
                    <Btn size="sm" variant="secondary" onClick={() => setView(t)}><Eye className="w-4 h-4" />Preview</Btn>
                    <Btn size="sm" variant="secondary" onClick={() => create.mutate({ copy_of: t.id })}><Copy className="w-4 h-4" />Duplicate</Btn>
                    <Btn size="sm" variant="ghost" className="!text-red-300" onClick={() => { if (window.confirm(`Delete “${t.name}”?`)) del.mutate(t.id); }}><Trash2 className="w-4 h-4" />Delete</Btn>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty title="No personal templates yet">Make a copy of one of the starting letters below, or write your own.</Empty>}
        </Section>

        <Section title="Starting letters from Pro IQ Recruits">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {defaults.map((d) => (
              <div key={d.id} className={`${C.card} p-4 space-y-2`}>
                <div className="flex items-center gap-2"><div className="font-black text-white text-lg leading-tight">{d.name}</div><Chip tone="amber">Platform default</Chip></div>
                <p className="text-sm text-slate-400">{d.description}</p>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                  <Btn size="sm" variant="secondary" onClick={() => setView(d)}><Eye className="w-4 h-4" />Preview</Btn>
                  <Btn size="sm" onClick={() => create.mutate({ based_on_default: d.key })} disabled={create.isPending}><Copy className="w-4 h-4" />Make my copy</Btn>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </>)}
    </div>
  );
}
