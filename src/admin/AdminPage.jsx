import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Upload, X, Plus } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { rc, useRcMutation, fmtDate, fmtDateLong } from '../api';
import { C, Btn, Chip, Field, Input, Textarea, Select, Loading, ErrorBox, Empty, Stat, VerificationBadge, ExtLink, Spinner } from '../ui';
import { FIELDS, COLUMNS, KIND_LABEL } from './adminConfig';

const TABS = [['dashboard', 'Dashboard'], ['programs', 'Programs'], ['coaches', 'Coaches'], ['seasons', 'Seasons'], ['rankings', 'Rankings'], ['camps', 'Camps'], ['idcamps', 'ID Camp Appearances'], ['players', 'Players'], ['users', 'Users'], ['imports', 'Imports'], ['verification', 'Data Verification'], ['sources', 'Sources']];
const STATUSES = ['verified', 'needs_review', 'historical', 'unverified', 'archived'];

export default function AdminPage() {
  const { user, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return <Loading />;
  if (user?.role !== 'admin') return <Empty title="Admins only">Sign in with an admin account to manage the recruiting database. <Link className="text-lime-300" to="/auth?next=/admin">Sign in</Link></Empty>;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-black tracking-tight">Recruiting admin</h1><Chip tone="amber">Admin</Chip></div>
      <div className="flex gap-1 overflow-x-auto border-b border-white/10 -mx-4 px-4">
        {TABS.map(([k, l]) => <NavLink key={k} to={`/admin/${k}`} className={({ isActive }) => `px-3.5 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${isActive ? 'border-lime-300 text-lime-300' : 'border-transparent text-slate-400 hover:text-white'}`}>{l}</NavLink>)}
      </div>
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardTab />} />
        <Route path="players" element={<PlayersTab />} />
        <Route path="users" element={<UsersTab />} />
        <Route path="imports" element={<ImportsTab />} />
        <Route path="verification" element={<VerificationTab />} />
        <Route path=":kind" element={<CollectionTab />} />
      </Routes>
    </div>
  );
}

/* ------------------------------- dashboard ------------------------------- */
function DashboardTab() {
  const { data: s, isLoading, error } = useQuery({ queryKey: ['rc', 'admin', 'stats'], queryFn: () => rc.get('/admin/stats') });
  if (isLoading) return <Loading />; if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="D1 programs" value={s.programs_by_division.D1} /><Stat label="D2 programs" value={s.programs_by_division.D2} />
        <Stat label="Coaches" value={s.coaches} /><Stat label="Camps" value={s.camps} />
        <Stat label="ID events" value={s.id_events} /><Stat label="Verified records" value={s.verified} />
        <Stat label="Need verification" value={s.needs_verification} /><Stat label="Player accounts" value={s.players} />
      </div>
      <div className={`${C.card} p-4 space-y-2`}>
        <div className="font-black">Data coverage gaps</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>Programs without coaches: <b className="text-white">{s.programs_without_coaches}</b></div>
          <div>Programs without season records: <b className="text-white">{s.programs_without_seasons}</b></div>
          <div>Programs without camps: <b className="text-white">{s.programs_without_camps}</b></div>
        </div>
        <div className="text-xs text-slate-500">Fill these with the CSV importers (Imports tab).</div>
      </div>
      <div className={`${C.card} p-4`}>
        <div className="font-black mb-2">Records by verification status</div>
        <div className="flex flex-wrap gap-2">{Object.entries(s.by_status).map(([k, v]) => <span key={k} className="inline-flex items-center gap-2"><VerificationBadge status={k} /><b>{v}</b></span>)}</div>
      </div>
    </div>
  );
}

/* ----------------------------- program picker ------------------------------ */
function ProgramPicker({ value, onChange, label = 'Program' }) {
  const [q, setQ] = useState('');
  const { data } = useQuery({ queryKey: ['rc', 'admin', 'pp', q], queryFn: () => rc.get('/admin/programs', { q, limit: 8 }), enabled: q.length > 1 });
  const { data: cur } = useQuery({ queryKey: ['rc', 'admin', 'one', 'programs', value], queryFn: () => rc.get(`/admin/programs/${value}`), enabled: !!value });
  return (
    <Field label={label}>
      <div className="space-y-1.5">
        {value && <div className="flex items-center gap-2"><Chip tone="lime">{cur?.school_name || value}</Chip><button type="button" className="text-xs text-slate-400 underline" onClick={() => onChange('')}>change</button></div>}
        {!value && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a school name…" />}
        {!value && data?.results?.length > 0 && <div className="rounded-xl border border-white/15 bg-[#0a1222] overflow-hidden">{data.results.map((p) => <button key={p.id} type="button" onClick={() => { onChange(p.id); setQ(''); }} className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10">{p.school_name} <span className="text-slate-500">· {p.division} · {p.state}</span></button>)}</div>}
      </div>
    </Field>
  );
}

/* --------------------------------- editor ---------------------------------- */
function Editor({ kind, record, onClose }) {
  const fields = FIELDS[kind];
  const [f, setF] = useState(() => {
    const base = { ...(record || {}) };
    for (const fd of fields) if (Array.isArray(base[fd.k])) base[fd.k] = base[fd.k].join('; ');
    for (const fd of fields) if (fd.type === 'tri') base[fd.k] = base[fd.k] === true ? 'yes' : base[fd.k] === false ? 'no' : '';
    return base;
  });
  const save = useRcMutation((body) => (record ? rc.patch(`/admin/${kind}/${record.id}`, body) : rc.post(`/admin/${kind}`, body)), { onSuccess: () => { toast.success('Saved'); onClose(); } });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = (e) => { e.preventDefault(); save.mutate(f, { onError: (er) => toast.error(er.message) }); };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0b1426] border border-white/15 p-5 space-y-4">
        <div className="flex items-center justify-between"><div className="font-black text-lg">{record ? 'Edit' : 'New'} {KIND_LABEL[kind]}</div><button type="button" onClick={onClose} aria-label="Close" className="p-2 text-slate-300"><X className="w-5 h-5" /></button></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kind !== 'programs' && <div className="sm:col-span-2"><ProgramPicker value={f.program_id || ''} onChange={(v) => setF((x) => ({ ...x, program_id: v }))} /></div>}
          {fields.map((fd) => {
            const wide = fd.type === 'textarea' ? 'sm:col-span-2' : '';
            return (
              <div key={fd.k} className={wide}>
                <Field label={fd.label || fd.k.replace(/_/g, ' ')} hint={fd.hint}>
                  {fd.type === 'select' ? <Select value={f[fd.k] ?? ''} onChange={set(fd.k)}><option value="">—</option>{fd.options.map((o) => <option key={o}>{o}</option>)}</Select>
                    : fd.type === 'tri' ? <Select value={f[fd.k] ?? ''} onChange={set(fd.k)}><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></Select>
                      : fd.type === 'textarea' ? <Textarea rows={3} value={f[fd.k] ?? ''} onChange={set(fd.k)} />
                        : fd.type === 'check' ? <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className="accent-lime-300 w-4 h-4" checked={f[fd.k] !== false} onChange={set(fd.k)} />Yes</label>
                          : <Input type={fd.type || 'text'} value={f[fd.k] ?? ''} onChange={set(fd.k)} />}
                </Field>
              </div>
            );
          })}
          <Field label="Verification status"><Select value={f.verification_status || 'unverified'} onChange={set('verification_status')}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select></Field>
        </div>
        <div className="flex justify-end gap-2"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" disabled={save.isPending}>{save.isPending && <Spinner className="w-4 h-4" />}Save</Btn></div>
      </form>
    </div>
  );
}

/* ------------------------------- collection -------------------------------- */
function CollectionTab({ fixedKind, defaultStatus }) {
  const params = useParams();
  const kind = fixedKind || params.kind;
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(defaultStatus || '');
  const [division, setDivision] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const editParam = sp.get('edit');
  useEffect(() => { setPage(1); }, [kind, q, status, division]);
  const { data, isLoading, error } = useQuery({ queryKey: ['rc', 'admin', 'list', kind, q, status, division, page], queryFn: () => rc.get(`/admin/${kind}`, { q, status, division, page, limit: 40 }), enabled: !!COLUMNS[kind], placeholderData: (p) => p });
  const setStatusM = useRcMutation(({ id, s }) => rc.post(`/admin/${kind}/${id}/status`, { status: s }));
  const del = useRcMutation((id) => rc.del(`/admin/${kind}/${id}`), { onSuccess: () => toast.success('Deleted') });
  const loaded = useRef(false);
  useEffect(() => {
    if (!editParam || loaded.current) return;
    loaded.current = true;
    rc.get(`/admin/${kind}/${editParam}`).then((r) => setEditing(r)).catch(() => {});
  }, [editParam, kind]);
  if (!COLUMNS[kind]) return <Empty title="Unknown section" />;
  const closeEditor = () => { setEditing(null); if (editParam) { sp.delete('edit'); setSp(sp, { replace: true }); } };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[180px]"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${KIND_LABEL[kind].toLowerCase()}…`} /></div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select>
        {kind === 'programs' && <Select value={division} onChange={(e) => setDivision(e.target.value)} className="!w-auto"><option value="">All levels</option>{['D1', 'D2', 'D3', 'NAIA', 'JUCO'].map((d) => <option key={d}>{d}</option>)}</Select>}
        {!fixedKind && <Btn onClick={() => setEditing({})}><Plus className="w-4 h-4" />New</Btn>}
      </div>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : (
        <div className={`${C.card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/10">{COLUMNS[kind].map((c) => <th key={c.h} className="p-3 font-bold">{c.h}</th>)}<th className="p-3">Status</th><th className="p-3" /></tr></thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  {COLUMNS[kind].map((c) => <td key={c.h} className="p-3 align-top max-w-[260px] truncate">{c.cell(r)}</td>)}
                  <td className="p-3 whitespace-nowrap">
                    <select value={r.verification_status} onChange={(e) => setStatusM.mutate({ id: r.id, s: e.target.value }, { onError: (er) => toast.error(er.message) })} aria-label="Verification status" className="bg-[#0a1222] border border-white/15 rounded-lg text-xs text-white px-2 py-1">
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </td>
                  <td className="p-3 whitespace-nowrap text-right">
                    {kind !== 'sources' && <button type="button" onClick={() => setEditing(r)} className="text-lime-300 font-semibold mr-3">Edit</button>}
                    {kind === 'programs' && <Link to={`/schools/${r.slug}`} className="text-slate-300 mr-3">View</Link>}
                    <button type="button" onClick={() => { if (window.confirm('Delete this record permanently?')) del.mutate(r.id, { onError: (er) => toast.error(er.message) }); }} className="text-red-300">Delete</button>
                  </td>
                </tr>
              ))}
              {!data.results.length && <tr><td colSpan={9} className="p-8 text-center text-slate-500">Nothing here yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > data.limit && (
        <div className="flex items-center justify-between"><Btn variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Btn><span className="text-sm text-slate-400">{data.total.toLocaleString()} records · page {page}</span><Btn variant="secondary" size="sm" disabled={page * data.limit >= data.total} onClick={() => setPage(page + 1)}>Next</Btn></div>
      )}
      {editing && <Editor kind={kind} record={editing.id ? editing : null} onClose={closeEditor} />}
    </div>
  );
}

function VerificationTab() {
  const [kind, setKind] = useState('programs');
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-400">Work through records that haven't been verified. Mark a record <b>Verified</b> only after checking it against its source link.</div>
      <div className="flex gap-1.5 flex-wrap">{['programs', 'coaches', 'seasons', 'rankings', 'camps', 'idcamps', 'sources'].map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${kind === k ? 'bg-lime-300 text-slate-950 border-lime-300' : 'bg-white/5 text-slate-200 border-white/15'}`}>{KIND_LABEL[k]}</button>)}</div>
      <CollectionTab key={kind} fixedKind={kind} defaultStatus="unverified" />
    </div>
  );
}

/* ------------------------------ players / users ----------------------------- */
function PlayersTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ['rc', 'admin', 'players'], queryFn: () => rc.get('/admin/players') });
  const toggle = useRcMutation(({ id, disabled }) => rc.patch(`/admin/players/${id}`, { disabled }));
  if (isLoading) return <Loading />; if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">Admins see account summaries only — never a player's private notes, contact history or pipeline.</div>
      <div className={`${C.card} overflow-x-auto`}><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/10"><th className="p-3">Player</th><th className="p-3">Class</th><th className="p-3">State</th><th className="p-3">Schools</th><th className="p-3">Privacy</th><th className="p-3">Joined</th><th className="p-3" /></tr></thead>
        <tbody>{data.players.map((p) => <tr key={p.id} className="border-b border-white/5"><td className="p-3 font-semibold text-white">{p.name}</td><td className="p-3">{p.grad_year || '—'}</td><td className="p-3">{p.state || '—'}</td><td className="p-3">{p.targets}</td><td className="p-3"><Chip>{p.privacy}</Chip></td><td className="p-3">{fmtDate(p.created_date, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td className="p-3 text-right"><button type="button" className={p.disabled ? 'text-lime-300' : 'text-red-300'} onClick={() => toggle.mutate({ id: p.id, disabled: !p.disabled })}>{p.disabled ? 'Enable' : 'Disable'}</button></td></tr>)}
          {!data.players.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">No player accounts yet.</td></tr>}</tbody></table></div>
    </div>
  );
}
function UsersTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ['rc', 'admin', 'users'], queryFn: () => rc.get('/admin/users') });
  if (isLoading) return <Loading />; if (error) return <ErrorBox error={error} />;
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">Platform-wide accounts. Roles are managed from the main Admin Panel.</div>
      <div className={`${C.card} overflow-x-auto`}><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/10"><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Recruiting profile</th><th className="p-3">Joined</th></tr></thead>
        <tbody>{data.users.map((u) => <tr key={u.id} className="border-b border-white/5"><td className="p-3 text-white font-semibold">{u.full_name}</td><td className="p-3">{u.email}</td><td className="p-3">{u.is_admin ? <Chip tone="amber">admin</Chip> : <Chip>user</Chip>}</td><td className="p-3">{u.has_recruiting_profile ? <Chip tone="lime">{u.profile_privacy}</Chip> : '—'}</td><td className="p-3">{fmtDate(u.created_date, { month: 'short', day: 'numeric', year: 'numeric' })}</td></tr>)}</tbody></table></div>
    </div>
  );
}

/* --------------------------------- imports ---------------------------------- */
const IMPORT_KINDS = ['programs', 'coaches', 'seasons', 'rankings', 'camps', 'idcamps'];
const ACTION_TONE = { new: 'lime', update: 'sky', duplicate: 'slate', review: 'amber', error: 'red' };

function ImportsTab() {
  const [kind, setKind] = useState('programs');
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [plan, setPlan] = useState(null);
  const [filter, setFilter] = useState('');
  const { data: hist } = useQuery({ queryKey: ['rc', 'admin', 'imports'], queryFn: () => rc.get('/admin/imports') });
  const run = useRcMutation((commit) => rc.post(`/admin/import/${kind}`, { csv, commit, overwrite_verified: overwrite, filename }));
  const boot = useRcMutation(() => rc.post('/admin/bootstrap'), { onSuccess: (r) => toast.success(r.loaded.length ? `Loaded ${r.loaded.map((x) => `${x.file} (${x.written})`).join(', ')}` : 'Bundled seed is already loaded') });
  const template = hist?.templates?.[kind];
  const onFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setFilename(file.name); setPlan(null);
    const r = new FileReader(); r.onload = () => setCsv(String(r.result)); r.readAsText(file);
  };
  const doRun = (commit) => run.mutate(commit, { onSuccess: (r) => { setPlan(r.plan); if (commit) toast.success(`Imported: ${r.applied.new} new, ${r.applied.updated} updated`); }, onError: (e) => toast.error(e.message) });
  const items = plan?.items?.filter((i) => !filter || i.action === filter) || [];
  return (
    <div className="space-y-6">
      <div className={`${C.card} p-4 space-y-4`}>
        <div className="flex flex-wrap gap-1.5">{IMPORT_KINDS.map((k) => <button key={k} type="button" onClick={() => { setKind(k); setPlan(null); }} className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${kind === k ? 'bg-lime-300 text-slate-950 border-lime-300' : 'bg-white/5 text-slate-200 border-white/15'}`}>{KIND_LABEL[k]}</button>)}</div>
        <div className="text-sm text-slate-400">Child records (coaches, seasons, rankings, camps, ID events) match a program by <code className="text-lime-200">program_id</code> or by <code className="text-lime-200">school_name</code>. Blank cells never erase existing data. Verified records are never overwritten unless you tick the box below.</div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="inline-flex"><input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" /><span className="inline-flex items-center gap-2 rounded-xl bg-white/10 border border-white/15 text-white px-4 py-2.5 text-[15px] font-semibold cursor-pointer hover:bg-white/15"><Upload className="w-4 h-4" />Choose CSV</span></label>
          {template && <a download={`${kind}-template.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(`${template}\n`)}`} className="inline-flex items-center gap-2 text-sm text-lime-300 font-semibold"><Download className="w-4 h-4" />Template</a>}
          {filename && <Chip>{filename}</Chip>}
        </div>
        <Textarea rows={5} value={csv} onChange={(e) => { setCsv(e.target.value); setPlan(null); }} placeholder="…or paste CSV here (first row = column names)" className="font-mono text-xs" />
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className="accent-lime-300 w-4 h-4" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked); setPlan(null); }} />Allow overwriting <b>verified</b> records</label>
        <div className="flex gap-2"><Btn variant="secondary" disabled={!csv.trim() || run.isPending} onClick={() => doRun(false)}>{run.isPending && <Spinner className="w-4 h-4" />}Preview</Btn>
          <Btn disabled={!plan || run.isPending || (plan.summary.new + plan.summary.updated + (overwrite ? plan.summary.review : 0)) === 0} onClick={() => { if (window.confirm('Apply this import to the live database?')) doRun(true); }}>Commit import</Btn></div>
      </div>

      {plan && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[['found', 'Records found', ''], ['new', 'New', 'new'], ['updated', 'Updated', 'update'], ['duplicate', 'Duplicates', 'duplicate'], ['review', 'Need review', 'review'], ['errors', 'Errors', 'error']].map(([k, l, a]) => (
              <button key={k} type="button" onClick={() => setFilter(filter === a ? '' : a)} className={`rounded-xl border px-3 py-2.5 text-left ${filter === a && a ? 'border-lime-300 bg-lime-300/10' : 'border-white/10 bg-white/5'}`}><div className="text-[11px] uppercase tracking-wider text-slate-400">{l}</div><div className="text-xl font-black text-white">{plan.summary[k]}</div></button>
            ))}
          </div>
          <div className={`${C.card} max-h-[420px] overflow-auto`}>
            <table className="w-full text-sm"><tbody>
              {items.slice(0, 400).map((i) => <tr key={`${i.line}-${i.id}`} className="border-b border-white/5 align-top"><td className="p-2.5 text-slate-500 w-14">#{i.line}</td><td className="p-2.5 w-24"><Chip tone={ACTION_TONE[i.action]}>{i.action}</Chip></td><td className="p-2.5 text-white">{i.label}</td><td className="p-2.5 text-xs text-slate-400">{[...(i.messages || []), i.changes?.length ? `changes: ${i.changes.join(', ')}` : ''].filter(Boolean).join(' · ')}</td></tr>)}
              {!items.length && <tr><td className="p-6 text-center text-slate-500">No rows in this view.</td></tr>}
            </tbody></table>
          </div>
          {plan.truncated && <div className="text-xs text-slate-500">Showing the first 1,500 rows; all rows are applied on commit.</div>}
        </div>
      )}

      <div className={`${C.card} p-4 space-y-3`}>
        <div className="flex items-center justify-between gap-3"><div><div className="font-black">Bundled seed data</div><div className="text-xs text-slate-400">Re-runs the program seed that ships with the app (adds missing programs; never touches edited or verified records).</div></div><Btn variant="secondary" size="sm" onClick={() => boot.mutate()} disabled={boot.isPending}>Load seed</Btn></div>
      </div>

      <div className="space-y-2">
        <div className="font-black">Import history</div>
        {hist?.imports?.length ? <div className={`${C.card} divide-y divide-white/10`}>{hist.imports.map((h) => <div key={h.id} className="p-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1"><b className="text-white">{KIND_LABEL[h.kind]}</b><span className="text-slate-400">{h.filename || 'pasted CSV'}</span><span>{h.applied.new} new · {h.applied.updated} updated · {h.summary.errors} errors · {h.summary.review} review</span><span className="text-xs text-slate-500 ml-auto">{h.actor} · {fmtDateLong(h.created_date)}</span></div>)}</div> : <div className="text-sm text-slate-500">No imports yet.</div>}
      </div>
    </div>
  );
}
