import React, { useState } from 'react';
import { Trash2, Pin, Plus, MailPlus, PhoneCall, MessageSquareReply, Tent, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { rc, useRcMutation, fmtDate, STAGE_LABEL } from '../api';
import { C, Btn, Section, Field, Input, Textarea, Select, Chip } from '../ui';

const KIND = {
  outreach: ['Email sent', MailPlus], response: ['Coach responded', MessageSquareReply], camp: ['Camp interaction', Tent],
  follow_up: ['Follow-up sent', MailPlus], call: ['Phone call', PhoneCall], other: ['Other', MailPlus],
};

/** The signed-in player's private notes + coach timeline for ONE school. Server scopes every row to her profile. */
export default function Workspace({ program, coaches, workspace }) {
  const { target, notes, contacts } = workspace;
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const blank = { kind: 'outreach', direction: 'outbound', method: 'email', contacted_at: new Date().toISOString().slice(0, 10), coach_id: '', summary: '', response: '', follow_up_date: '' };
  const [form, setForm] = useState(blank);
  const fail = (e) => toast.error(e.message);
  const addNote = useRcMutation((body) => rc.post('/me/notes', { program_id: program.id, body }), { onSuccess: () => setNote('') });
  const delNote = useRcMutation((id) => rc.del(`/me/notes/${id}`));
  const pinNote = useRcMutation((n) => rc.patch(`/me/notes/${n.id}`, { pinned: !n.pinned }));
  const addContact = useRcMutation((b) => rc.post('/me/contacts', { program_id: program.id, ...b }), { onSuccess: () => { setAdding(false); setForm(blank); toast.success('Logged'); } });
  const delContact = useRcMutation((id) => rc.del(`/me/contacts/${id}`));
  const stage = useRcMutation((s) => rc.patch(`/me/targets/${target.id}`, { stage: s }));
  const remove = useRcMutation(() => rc.del(`/me/targets/${target.id}`), { onSuccess: () => toast.success('Removed from your list') });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const coach = coaches.find((c) => c.id === form.coach_id);

  const submitContact = (e) => {
    e.preventDefault();
    const outbound = form.kind === 'outreach' || form.kind === 'follow_up';
    addContact.mutate({ ...form, direction: form.kind === 'response' ? 'inbound' : outbound ? 'outbound' : form.direction, coach_name: coach ? `${coach.first_name} ${coach.last_name}` : '', email: coach?.email || '' }, { onError: fail });
  };

  return (
    <Section title={`My recruiting · ${program.school_name}`} id="mine">
      <div className={`${C.card} p-4 space-y-5 border-lime-300/20`}>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-300">Stage
            <Select value={target.stage} onChange={(e) => stage.mutate(e.target.value, { onError: fail })} className="!w-auto !py-1.5 !text-sm">
              {Object.entries(STAGE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </div>
          <Btn variant="ghost" size="sm" onClick={() => { if (window.confirm(`Remove ${program.school_name} from your list? Your notes and contact history are kept.`)) remove.mutate(undefined, { onError: fail }); }}><Trash2 className="w-4 h-4" />Remove</Btn>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Private notes <span className="normal-case font-medium text-slate-500">· only you can see these</span></div>
          <div className="flex gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder='e.g. "Coach wants video" or "Attend July ID camp"' onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) addNote.mutate(note, { onError: fail }); }} />
            <Btn disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate(note, { onError: fail })}><Plus className="w-4 h-4" />Add</Btn>
          </div>
          {notes.length === 0 ? <div className="text-sm text-slate-500">No notes yet.</div> : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-white/5 px-3.5 py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0"><div className="text-sm text-slate-100 whitespace-pre-line break-words">{n.body}</div><div className="text-[11px] text-slate-500 mt-0.5">{fmtDate(n.created_date, { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
                  <button type="button" aria-label="Pin note" onClick={() => pinNote.mutate(n)} className={`p-1.5 ${n.pinned ? 'text-lime-300' : 'text-slate-500'}`}><Pin className="w-4 h-4" /></button>
                  <button type="button" aria-label="Delete note" onClick={() => delNote.mutate(n.id)} className="p-1.5 text-slate-500 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Coach communication</div>
            <Btn size="sm" variant={adding ? 'ghost' : 'outline'} onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : <><Plus className="w-4 h-4" />Log contact</>}</Btn>
          </div>
          {adding && (
            <form onSubmit={submitContact} className="rounded-xl bg-white/5 p-3.5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="What happened"><Select value={form.kind} onChange={set('kind')}>{Object.entries(KIND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                <Field label="Date"><Input type="date" value={form.contacted_at} onChange={set('contacted_at')} /></Field>
                <Field label="Method"><Select value={form.method} onChange={set('method')}>{['email', 'phone', 'text', 'in_person', 'camp', 'social', 'other'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</Select></Field>
                <Field label="Coach"><Select value={form.coach_id} onChange={set('coach_id')}><option value="">Not specified</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.title || c.role_label}</option>)}</Select></Field>
              </div>
              <Field label="Summary"><Input value={form.summary} onChange={set('summary')} placeholder="Sent intro email with highlight video" required /></Field>
              <Field label="Coach's response / notes"><Textarea rows={2} value={form.response} onChange={set('response')} /></Field>
              <Field label="Follow up on"><Input type="date" value={form.follow_up_date} onChange={set('follow_up_date')} /></Field>
              <Btn type="submit" disabled={addContact.isPending}>Save to timeline</Btn>
            </form>
          )}
          {contacts.length === 0 ? <div className="text-sm text-slate-500">Nothing logged yet. Log emails, replies, calls and camp visits to build your timeline.</div> : (
            <ol className="relative border-l border-white/15 ml-2 space-y-4">
              {contacts.map((c) => {
                const [label, Icon] = KIND[c.kind] || KIND.other;
                return (
                  <li key={c.id} className="pl-5 relative">
                    <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-[#0e1729] border-2 border-lime-300 flex items-center justify-center"><Icon className="w-2 h-2 text-lime-300" /></span>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-lime-300">{fmtDate(c.contacted_at, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div className="text-sm font-semibold text-white">{label}{c.coach_name ? ` · ${c.coach_name}` : ''} <span className="font-normal text-slate-400">via {c.method.replace('_', ' ')}</span></div>
                        {c.summary && <div className="text-sm text-slate-300">{c.summary}</div>}
                        {c.response && <div className="text-sm text-slate-400 whitespace-pre-line">{c.response}</div>}
                        {c.follow_up_date && <Chip tone="amber" className="mt-1"><CalendarClock className="w-3 h-3" />Follow up {fmtDate(c.follow_up_date)}</Chip>}
                      </div>
                      <button type="button" aria-label="Delete entry" onClick={() => delContact.mutate(c.id)} className="p-1.5 text-slate-500 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Section>
  );
}
