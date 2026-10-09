import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ExternalLink, MapPin, GraduationCap, Trophy, Users, Link2, Scale, ShieldCheck, Pencil, Mail } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import ContactCoach from '../ContactCoach';
import { useProgram } from '../api';
import { fmtDateLong } from '../api';
import { C, Chip, DivisionChip, Section, Stat, Loading, ErrorBox, VerificationBadge, SaveButton, ShareButton, SchoolAvatar, CoachEmail, ExtLink, Btn, Empty } from '../ui';
import { CampRow, ExternalEventRow } from './CampsPage';
import Workspace from './Workspace';

const SECTIONS = [['snapshot', 'Snapshot'], ['staff', 'Coaches'], ['performance', 'Results'], ['rankings', 'Rankings'], ['camps', 'Camps'], ['academics', 'Academics'], ['links', 'Links']];

/** Everyone sees whether a record has been checked: "Verified", or a plain "Unverified" until an admin signs it off. */
function Trust({ status, admin }) {
  if (status === 'verified') return <VerificationBadge status="verified" />;
  if (admin) return <VerificationBadge status={status} />;
  return <Chip tone="amber" className="!py-0 text-[10px]">Unverified</Chip>;
}

function ncaaLine(s) {
  if (s.ncaa_tournament_appearance === true) return `NCAA Tournament: ${s.ncaa_tournament_round || 'Qualified'}`;
  if (s.ncaa_tournament_appearance === false) return 'No NCAA Tournament appearance';
  return '';
}

export default function SchoolPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useProgram(slug);
  const { isAuthenticated } = useAuth();
  const nav = useNavigate(); const loc = useLocation(); const [sp, setSp] = useSearchParams();
  const [contacting, setContacting] = useState(false);
  // Signed-out visitors come back to this school's Contact Coach flow after signing in (?contact=1).
  useEffect(() => { if (isAuthenticated && sp.get('contact') === '1' && data) { setContacting(true); const n = new URLSearchParams(sp); n.delete('contact'); setSp(n, { replace: true }); } }, [isAuthenticated, sp, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const contactCoach = () => { if (!isAuthenticated) { nav(`/auth?next=${encodeURIComponent(`${loc.pathname}?contact=1`)}`); return; } setContacting(true); };
  if (isLoading) return <Loading />;
  if (error) return <div className="space-y-4"><ErrorBox error={error} /><Link to="/schools" className="text-red-400 font-semibold">← Back to schools</Link></div>;
  const { program: p, summary, coaches, seasons, rankings, camps, id_appearances: ids, sources, workspace, viewer } = data;
  const recent = seasons.filter((s) => s.completed).slice(0, 3);
  const years = data.recent_season_years;
  const head = coaches.find((c) => c.role === 'head');
  const staffGroups = [
    ['Head Coach', coaches.filter((c) => c.role === 'head')],
    ['Assistant Coaches', coaches.filter((c) => ['associate_head', 'assistant', 'goalkeeper'].includes(c.role))],
    ['Recruiting & Support Staff', coaches.filter((c) => ['recruiting_coordinator', 'director_ops', 'volunteer', 'other'].includes(c.role))],
  ].filter(([, l]) => l.length);
  const chart = [...recent].reverse().map((s) => ({ season: String(s.season), Wins: s.wins ?? 0, Ties: s.ties ?? 0, Losses: s.losses ?? 0 }));
  const ncaaSeasons = seasons.filter((s) => s.ncaa_tournament_appearance === true);
  const target = workspace?.target;
  const places = `${p.city ? `${p.city}, ` : ''}${p.state_name || p.state}`;

  return (
    <div className="space-y-8">
      <div className={`${C.card} p-5 sm:p-6 space-y-5`}>
        <div className="flex items-start gap-4">
          <SchoolAvatar school={p} size="w-16 h-16 sm:w-20 sm:h-20" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-widest text-red-400">{p.sport_label}</div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">{p.school_name}</h1>
            <div className="text-slate-300 mt-0.5">{p.official_school_name !== p.school_name ? `${p.official_school_name} · ` : ''}{p.nickname}</div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <DivisionChip division={p.division} /><Chip>{p.division_label}</Chip>
              {p.conference && <Chip tone="sky">{p.conference}</Chip>}
              {places && <Chip><MapPin className="w-3 h-3" />{places}</Chip>}
              {p.public_private && <Chip>{p.public_private}</Chip>}
              {viewer.is_admin && <VerificationBadge status={p.verification_status} />}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={contactCoach} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-black text-white bg-gradient-to-b from-[#8a0f0f] to-[#660000] border border-[#BFA87C]/70 shadow-[0_2px_10px_rgba(102,0,0,.6)] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#BFA87C]"><Mail className="w-4 h-4 text-[#BFA87C]" />Contact Coach</button>
          <SaveButton program={p} target={target} size="md" />
          <ShareButton url={`/schools/${p.slug}`} title={`${p.school_name} Women's Soccer`} />
          <Link to={`/compare?ids=${p.id}`}><Btn variant="secondary" size="sm"><Scale className="w-4 h-4" />Compare</Btn></Link>
          {head?.email && <a href={`mailto:${head.email}`}><Btn variant="outline" size="sm">Email coach</Btn></a>}
          {viewer.is_admin && <Link to={`/admin/programs?edit=${p.id}`}><Btn variant="ghost" size="sm"><Pencil className="w-4 h-4" />Edit</Btn></Link>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          {SECTIONS.map(([id, l]) => <a key={id} href={`#${id}`} className="shrink-0 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10">{l}</a>)}
        </div>
      </div>

      {viewer.signed_in && target && <Workspace program={p} coaches={coaches} workspace={workspace} camps={[...camps.current, ...camps.previous]} />}
      {viewer.signed_in && !target && (
        <div className={`${C.card} p-4 flex items-center justify-between gap-3`}>
          <div className="text-sm text-slate-300">Save {p.school_name} to keep private notes and log coach contact here.</div>
          <SaveButton program={p} target={null} />
        </div>
      )}

      {contacting && <ContactCoach program={p} onClose={() => setContacting(false)} />}

      <Section title="Program snapshot" id="snapshot">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2].map((i) => {
            const s = recent[i];
            return <Stat key={i} label={`${s ? s.season : (years[i] || new Date().getFullYear() - 1 - i)} record`} value={s?.record} sub={s ? (s.conference_champion ? 'Conference champion' : s.conference_record ? `Conf. ${s.conference_record}` : '') : 'Not on file yet'} />;
          })}
          <Stat label="Best national ranking" value={summary.best_ranking ? `#${summary.best_ranking.rank}` : 'Not ranked'} sub={summary.best_ranking ? `${summary.best_ranking.season} · ${summary.best_ranking.organization}` : ''} />
        </div>
        <div className={`${C.card} p-4`}>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">NCAA tournament history</div>
          {ncaaSeasons.length ? (
            <div className="flex flex-wrap gap-2">{ncaaSeasons.map((s) => <Chip key={s.id} tone="lime"><Trophy className="w-3 h-3" />{s.season} · {s.ncaa_tournament_round || 'Qualified'}</Chip>)}</div>
          ) : <div className="text-sm text-slate-400">{seasons.length ? 'No NCAA tournament appearances on file for the seasons we track.' : 'NCAA tournament results not on file yet.'}</div>}
        </div>
        {data.conference_history?.length > 0 && (
          <div className={`${C.card} p-4`}>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Conference history</div>
            <ol className="space-y-1.5">
              {data.conference_history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-white">{h.conference}</span>
                  <span className="text-slate-400">{h.start_season || 'earlier'}–{h.end_season || 'present'}</span>
                  {!h.end_season && h.conference === p.conference && <Chip tone="lime">Current</Chip>}
                  <Trust status={h.verification_status} admin={viewer.is_admin} />
                </li>
              ))}
            </ol>
          </div>
        )}
        {p.description && <p className="text-slate-300 leading-relaxed">{p.description}</p>}
      </Section>

      <Section title="Coaching staff" id="staff" action={head?.email && <a href={`mailto:${head.email}`}><Btn size="sm"><Users className="w-4 h-4" />Email head coach</Btn></a>}>
        {staffGroups.length ? staffGroups.map(([title, list]) => (
          <div key={title} className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {list.map((c) => (
                <div key={c.id} className={`${C.card} p-4 space-y-1.5`}>
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="font-black text-white text-lg leading-tight">{c.first_name} {c.last_name}</div><div className="text-sm text-red-300">{c.title || c.role_label}</div></div>
                    <Trust status={c.verification_status} admin={viewer.is_admin} />
                  </div>
                  <CoachEmail email={c.email} />
                  {c.phone && <div className="text-sm text-slate-300"><a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a></div>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {c.bio_url && <ExtLink href={c.bio_url}>Coaching bio</ExtLink>}
                    {c.profile_url && <ExtLink href={c.profile_url}>Profile</ExtLink>}
                  </div>
                  {(c.years_at_program || c.previous_schools?.length > 0) && <div className="text-xs text-slate-400">{c.years_at_program ? `${c.years_at_program} yrs at ${p.school_name}` : ''}{c.previous_schools?.length ? ` · Previously ${c.previous_schools.join(', ')}` : ''}</div>}
                </div>
              ))}
            </div>
          </div>
        )) : <Empty title="Staff not listed yet">We haven't added this program's coaching staff. {p.team_website ? <>Check the <ExtLink href={p.team_website}>official team page</ExtLink>.</> : ''}</Empty>}
      </Section>

      <Section title="Recent performance" id="performance">
        {data.current_season && (
          <div className={`${C.card} p-4 border-sky-300/30 flex items-center justify-between gap-4`}>
            <div><div className="text-sm font-bold text-sky-200 flex items-center gap-2">{data.current_season.season}<Chip tone="sky">Current season · in progress</Chip></div><div className="text-2xl font-black">{data.current_season.record || '—'}</div></div>
            <div className="text-sm text-slate-300 text-right">{data.current_season.conference_that_season && <div>{data.current_season.conference_that_season}</div>}{data.current_season.conference_record && <div>Conference: {data.current_season.conference_record}</div>}</div>
          </div>
        )}
        {recent.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
            <div className="grid gap-3">
              {recent.map((s) => (
                <div key={s.id} className={`${C.card} p-4 flex items-start justify-between gap-4`}>
                  <div>
                    <div className="text-sm font-bold text-red-400 flex items-center gap-2">{s.season}<Trust status={s.verification_status} admin={viewer.is_admin} /></div>
                    <div className="text-3xl font-black">{s.record || '—'}</div>
                  </div>
                  <div className="text-sm text-slate-300 space-y-1 text-right">
                    {s.conference_that_season && s.conference_that_season !== p.conference && <div className="text-slate-400">Then in the {s.conference_that_season}</div>}
                    {s.conference_record && <div>Conference: {s.conference_record}</div>}
                    {s.conference_champion && <div className="text-red-400 font-semibold">Conference Champion</div>}
                    {!s.conference_champion && s.conference_finish && <div>Conference finish: {s.conference_finish}</div>}
                    {s.conference_tournament_result && <div>Conf. tournament: {s.conference_tournament_result}</div>}
                    {ncaaLine(s) && <div className={s.ncaa_tournament_appearance ? 'text-red-300 font-semibold' : 'text-slate-500'}>{ncaaLine(s)}</div>}
                    {s.goals_for != null && <div className="text-slate-400">GF {s.goals_for} · GA {s.goals_against ?? '—'}</div>}
                    {s.source_url && <ExtLink href={s.source_url} className="text-xs inline-flex items-center gap-1">Source <ExternalLink className="w-3 h-3" /></ExtLink>}
                  </div>
                </div>
              ))}
            </div>
            {chart.some((c) => c.Wins + c.Losses + c.Ties) && (
              <div className={`${C.card} p-3 h-64`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="season" stroke="#94a3b8" fontSize={12} /><YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#0b1426', border: '1px solid rgba(255,255,255,.15)', borderRadius: 12, color: '#fff' }} />
                    <Bar dataKey="Wins" stackId="a" fill="#bef264" /><Bar dataKey="Ties" stackId="a" fill="#7dd3fc" /><Bar dataKey="Losses" stackId="a" fill="#f87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : <Empty title="Season records not on file yet">We're still adding results for this program. Check the {p.team_website || p.athletics_website ? <ExtLink href={p.team_website || p.athletics_website}>official site</ExtLink> : 'program website'} for current results.</Empty>}
      </Section>

      <Section title="National rankings" id="rankings">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(years.length ? years : [new Date().getFullYear() - 1, new Date().getFullYear() - 2, new Date().getFullYear() - 3]).map((yr) => {
            const row = rankings.find((r) => r.season === yr);
            return (
              <div key={yr} className={`${C.card} p-4 space-y-2`}>
                <div className="text-sm font-bold text-red-400">{yr}</div>
                {row ? row.organizations.map((o) => (
                  <div key={o.organization} className="text-sm">
                    <div className="text-xs text-slate-400">{o.organization}</div>
                    <div className="flex gap-4 font-bold text-white"><span>Highest: #{o.highest}</span>{o.final != null && <span>Final: #{o.final}</span>}{o.preseason != null && <span className="text-slate-300 font-semibold">Pre: #{o.preseason}</span>}</div>
                    {o.source_urls[0] && <ExtLink href={o.source_urls[0]} className="text-xs">Source</ExtLink>}
                  </div>
                )) : <><div className="text-slate-200 font-semibold">Not nationally ranked</div><div className="text-xs text-slate-500">No ranking on file for {yr}.</div></>}
              </div>
            );
          })}
        </div>
        {rankings.filter((r) => !years.includes(r.season)).map((row) => (
          <div key={row.season} className="text-sm text-slate-300">{row.season}: {row.organizations.map((o) => `${o.organization} highest #${o.highest}${o.final != null ? `, final #${o.final}` : ''}`).join(' · ')}</div>
        ))}
      </Section>

      <Section title="Camps" id="camps">
        <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-sm text-sky-100">
          <b>Official university camps</b> are run by the school. <b>External ID camp appearances</b> are third-party events where the program is advertised — they are not official school camps.
        </div>
        {[[camps.current_year, camps.current, 'Upcoming / completed camps'], [camps.previous_year, camps.previous, 'Historical camps']].map(([yr, list, sub]) => (
          <div key={yr} className="space-y-2">
            <div className="flex items-baseline gap-3"><div className="text-2xl font-black">{yr}</div><div className="text-sm text-slate-400">{sub}</div><Chip tone="lime" className="ml-auto">Official University Camp</Chip></div>
            {list.length ? <div className="grid gap-2">{list.map((c) => <CampRow key={c.id} camp={c} program={p} workspace={workspace} signedIn={viewer.signed_in} showSchool={false} />)}</div>
              : <div className={`${C.card} p-4 text-sm text-slate-400`}>No official camps on file for {yr}.{p.camps_url && <> See the <ExtLink href={p.camps_url}>school's camps page</ExtLink>.</>}</div>}
          </div>
        ))}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-3"><div className="text-lg font-black">External ID camp appearances</div><Chip tone="amber" className="ml-auto">External ID Camp / Recruiting Appearance</Chip></div>
          {[['Upcoming', ids.upcoming], ['Recent', ids.recent]].map(([l, list]) => (
            <div key={l} className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{l}</div>
              {list.length ? list.map((e) => <ExternalEventRow key={e.id} event={e} />) : <div className="text-sm text-slate-500">None on file.</div>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Academics & location" id="academics">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={`${C.card} p-4 space-y-2`}>
            <div className="flex items-center gap-2 font-black"><GraduationCap className="w-5 h-5 text-red-400" />Academics</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-slate-400">Type</div><div>{[p.public_private, p.school_type].filter(Boolean).join(' · ') || '—'}</div>
              <div className="text-slate-400">Enrollment</div><div>{p.enrollment ? p.enrollment.toLocaleString() : '—'}</div>
              <div className="text-slate-400">Typical GPA</div><div>{p.gpa_expectation || '—'}</div>
              <div className="text-slate-400">Acceptance rate</div><div>{p.acceptance_rate != null ? `${p.acceptance_rate}%` : '—'}</div>
            </div>
            {p.academic_programs?.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{p.academic_programs.slice(0, 20).map((m) => <Chip key={m}>{m}</Chip>)}</div>}
            {p.academic_info ? <p className="text-sm text-slate-300">{p.academic_info}</p> : <p className="text-xs text-slate-500">Detailed academic information hasn't been added yet.</p>}
            {p.admissions_url && <ExtLink href={p.admissions_url} className="text-sm">Admissions information →</ExtLink>}
          </div>
          <div className={`${C.card} p-4 space-y-2`}>
            <div className="flex items-center gap-2 font-black"><MapPin className="w-5 h-5 text-red-400" />Location</div>
            <div className="text-lg font-bold">{places || '—'}</div>
            <div className="text-sm text-slate-400">{p.region}</div>
            <a className="text-sm text-red-400 font-semibold" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/${encodeURIComponent(`${p.official_school_name} ${places}`)}`}>Open in Maps →</a>
          </div>
        </div>
      </Section>

      <Section title="Official links" id="links">
        <div className="flex flex-wrap gap-2">
          {[['School website', p.school_website], ['Athletics', p.athletics_website], ["Women's soccer", p.team_website], ['Roster', p.roster_url], ['Schedule', p.schedule_url], ['Camps', p.camps_url], ['Admissions', p.admissions_url]]
            .filter(([, u]) => u).map(([l, u]) => <a key={l} href={u} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 border border-white/15 text-white px-3.5 py-2 text-sm font-semibold hover:bg-white/15"><Link2 className="w-4 h-4 text-red-400" />{l}</a>)}
          {![p.school_website, p.athletics_website, p.team_website, p.roster_url, p.schedule_url, p.camps_url].some(Boolean) && <div className="text-sm text-slate-400">Official links haven't been added yet — search "{p.official_school_name} women's soccer" to find the program page.</div>}
        </div>
      </Section>

      <Section title="Data sources" id="sources" action={viewer.is_admin ? <Chip tone="amber"><ShieldCheck className="w-3 h-3" />Admin view</Chip> : null}>
        {sources.length ? (
          <div className={`${C.card} divide-y divide-white/10`}>
            {sources.map((s) => (
              <div key={s.id || s.source_url} className="p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <ExtLink href={s.source_url} className="font-semibold">{s.source_name || s.source_url.replace(/^https?:\/\//, '').slice(0, 60)}</ExtLink>
                {s.source_type && <Chip>{s.source_type}</Chip>}
                {viewer.is_admin && s.entity_type && <Chip tone="sky">{s.entity_type}</Chip>}
                {viewer.is_admin && s.verification_status && <VerificationBadge status={s.verification_status} compact />}
                <span className="text-xs text-slate-500 ml-auto">{s.last_verified_at ? `Verified ${fmtDateLong(s.last_verified_at)}` : s.accessed_at ? `Accessed ${fmtDateLong(s.accessed_at)}` : ''}</span>
                {viewer.is_admin && s.information_extracted && <div className="basis-full text-xs text-slate-400">Extracted: {s.information_extracted}</div>}
              </div>
            ))}
          </div>
        ) : <div className="text-sm text-slate-500">No sources recorded for this program yet.</div>}
      </Section>
    </div>
  );
}
