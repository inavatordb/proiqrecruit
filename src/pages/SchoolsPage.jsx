import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, Search } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useMeta, usePrograms, useDashboard, useMyProfile } from '../api';
import { C, Btn, Loading, Empty, ErrorBox, SchoolCard, Select, Field, Input } from '../ui';

const TOGGLES = [
  ['Performance', [['winning', 'Winning record'], ['champion', 'Conference champion'], ['ncaa', 'NCAA tournament'], ['ranked', 'Nationally ranked']]],
  ['Recruiting', [['has_id_camp', 'Runs ID camps'], ['upcoming_camps', 'Upcoming camps'], ['recent_id', 'Recent ID appearances'], ['coach_contact', 'Coach email listed'], ['recruiting_coordinator', 'Has recruiting coordinator']]],
];
const ROUNDS = [['', 'Any NCAA result'], ['second round', 'Second Round or better'], ['round of 16', 'Round of 16 or better'], ['quarterfinal', 'Quarterfinal or better'], ['semifinal', 'Semifinal or better']];

export default function SchoolsPage() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: meta } = useMeta();
  const { data: profileRes } = useMyProfile(isAuthenticated);
  const { data: dash } = useDashboard(isAuthenticated);
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState([]);
  const params = Object.fromEntries(sp.entries());
  const fromState = profileRes?.profile?.state || '';
  const { data, isLoading, isFetching, error } = usePrograms({ ...params, from_state: fromState || undefined, limit: 24 });
  const targets = useMemo(() => new Map((dash?.cards || []).map((c) => [c.school.id, { id: c.target_id, stage: c.stage }])), [dash]);

  const set = (patch) => { const n = { ...params, ...patch, page: undefined }; for (const k of Object.keys(n)) if (n[k] === '' || n[k] == null || n[k] === false) delete n[k]; setSp(n, { replace: true }); };
  const csv = (k) => (params[k] ? params[k].split(',') : []);
  const toggleCsv = (k, v) => { const cur = csv(k); set({ [k]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',') }); };
  const confs = (meta?.conferences || []).filter((c) => !csv('division').length || csv('division').includes(c.division));
  const activeCount = ['state', 'region', 'conference', 'winning', 'champion', 'ncaa', 'ranked', 'has_id_camp', 'upcoming_camps', 'recent_id', 'coach_contact', 'recruiting_coordinator', 'ncaa_round', 'top', 'academic', 'max_distance'].filter((k) => params[k]).length;
  const page = Number(params.page || 1);

  const Chipbtn = ({ on, onClick, children }) => (
    <button type="button" onClick={onClick} aria-pressed={on} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold border transition-colors ${on ? 'bg-lime-300 text-slate-950 border-lime-300' : 'bg-white/5 text-slate-200 border-white/15 hover:bg-white/10'}`}>{children}</button>
  );

  const filters = (
    <div className="space-y-5">
      <Field label="Level">
        <div className="flex flex-wrap gap-2">
          {(meta?.divisions || []).map((d) => (d.count > 0
            ? <Chipbtn key={d.id} on={csv('division').includes(d.id)} onClick={() => toggleCsv('division', d.id)}>{d.id}</Chipbtn>
            : <span key={d.id} className="rounded-full px-3.5 py-1.5 text-sm font-semibold bg-white/[0.03] text-slate-600 border border-white/5" title="Coming soon">{d.id} · soon</span>))}
        </div>
      </Field>
      <Field label="Region">
        <div className="flex flex-wrap gap-2">{(meta?.regions || []).map((r) => <Chipbtn key={r} on={csv('region').includes(r)} onClick={() => toggleCsv('region', r)}>{r}</Chipbtn>)}</div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="State"><Select value={params.state || ''} onChange={(e) => set({ state: e.target.value })}><option value="">Any</option>{(meta?.states || []).map((s) => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}</Select></Field>
        <Field label="Conference"><Select value={params.conference || ''} onChange={(e) => set({ conference: e.target.value })}><option value="">Any</option>{confs.map((c) => <option key={`${c.division}${c.name}`} value={c.name}>{c.name} ({c.count})</option>)}</Select></Field>
      </div>
      {fromState
        ? <Field label={`Within … miles of ${fromState}`} hint="Approximate, measured from the center of your state."><Select value={params.max_distance || ''} onChange={(e) => set({ max_distance: e.target.value })}><option value="">Any distance</option>{[150, 300, 500, 800, 1200].map((m) => <option key={m} value={m}>{m} miles</option>)}</Select></Field>
        : <div className="text-xs text-slate-500">Add your state in <Link className="underline text-lime-300" to="/profile">your profile</Link> to filter by distance.</div>}
      {TOGGLES.map(([title, items]) => (
        <Field key={title} label={title}>
          <div className="flex flex-wrap gap-2">{items.map(([k, l]) => <Chipbtn key={k} on={!!params[k]} onClick={() => set({ [k]: params[k] ? '' : '1' })}>{l}</Chipbtn>)}</div>
        </Field>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <Field label="NCAA tournament"><Select value={params.ncaa_round || ''} onChange={(e) => set({ ncaa_round: e.target.value })}>{ROUNDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Best ranking"><Select value={params.top || ''} onChange={(e) => set({ top: e.target.value })}><option value="">Any</option>{[10, 25, 50].map((n) => <option key={n} value={n}>Top {n}</option>)}</Select></Field>
      </div>
      <Field label="Academics" hint="Matches majors / academic programs where we have them."><Input value={params.academic || ''} onChange={(e) => set({ academic: e.target.value })} placeholder="e.g. nursing, engineering" /></Field>
      {activeCount > 0 && <Btn variant="ghost" size="sm" onClick={() => setSp(params.division ? { division: params.division } : {}, { replace: true })}><X className="w-4 h-4" />Clear filters</Btn>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Find a program</h1>
          <div className="text-slate-400 text-sm">{data ? `${data.total.toLocaleString()} women's soccer programs` : "Women's soccer programs"}</div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-72"><Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" /><input value={params.q || ''} onChange={(e) => set({ q: e.target.value })} placeholder="School, city, nickname…" className={`${C.input} pl-9`} /></div>
          <Select value={params.sort || 'name'} onChange={(e) => set({ sort: e.target.value })} className="!w-auto"><option value="name">A–Z</option><option value="ranking">Best ranking</option><option value="record">Most wins</option>{fromState && <option value="distance">Nearest</option>}</Select>
          <Btn variant="secondary" className="lg:hidden" onClick={() => setOpen(true)}><SlidersHorizontal className="w-4 h-4" />{activeCount ? activeCount : ''}</Btn>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        <aside className={`${C.card} p-4 hidden lg:block sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto`}>{filters}</aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden bg-black/70" onClick={() => setOpen(false)}>
            <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-[#0b1426] border-t border-white/15 p-5 pb-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><div className="font-black text-lg">Filters</div><button type="button" onClick={() => setOpen(false)} className="p-2 text-slate-300" aria-label="Close"><X className="w-5 h-5" /></button></div>
              {filters}
              <Btn size="lg" className="w-full mt-6" onClick={() => setOpen(false)}>Show {data?.total ?? ''} schools</Btn>
            </div>
          </div>
        )}
        <div className="space-y-4 min-w-0">
          <ErrorBox error={error} />
          {isLoading ? <Loading /> : data?.results?.length ? (
            <>
              <div className={`grid sm:grid-cols-2 xl:grid-cols-3 gap-3 ${isFetching ? 'opacity-70' : ''}`}>
                {data.results.map((s) => (
                  <SchoolCard key={s.id} school={s} target={targets.get(s.id) ? { stage: targets.get(s.id).stage } : null}
                    compareOn={compare.includes(s.id)} onCompare={() => setCompare((c) => (c.includes(s.id) ? c.filter((x) => x !== s.id) : [...c.slice(-3), s.id]))} />
                ))}
              </div>
              {data.total > data.limit && (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <Btn variant="secondary" disabled={page <= 1} onClick={() => { setSp({ ...params, page: String(page - 1) }); window.scrollTo(0, 0); }}>Previous</Btn>
                  <span className="text-sm text-slate-400">Page {page} of {Math.ceil(data.total / data.limit)}</span>
                  <Btn variant="secondary" disabled={page * data.limit >= data.total} onClick={() => { setSp({ ...params, page: String(page + 1) }); window.scrollTo(0, 0); }}>Next</Btn>
                </div>
              )}
            </>
          ) : <Empty title="No programs match those filters">Try removing a filter. Some data (rankings, camps) is still being added, so filters that depend on it return fewer schools.</Empty>}
        </div>
      </div>

      {compare.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 inset-x-0 z-40 px-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto rounded-2xl bg-sky-500 text-slate-950 shadow-2xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="font-bold text-sm">{compare.length} selected to compare</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCompare([])} className="text-sm font-semibold px-2">Clear</button>
              <button type="button" disabled={compare.length < 2} onClick={() => nav(`/compare?ids=${compare.join(',')}`)} className="rounded-lg bg-slate-950 text-white px-4 py-1.5 text-sm font-bold disabled:opacity-40">Compare</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
