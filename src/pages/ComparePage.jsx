import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rc } from '../api';
import { C, Loading, ErrorBox, SaveButton, Empty, DivisionChip, ExtLink } from '../ui';

const ROWS = [
  ['Level', (s) => <DivisionChip division={s.division} />],
  ['Conference', (s) => s.conference || '—'],
  ['Location', (s) => [s.city, s.state].filter(Boolean).join(', ') || '—'],
  ['Type', (s) => s.public_private || '—'],
  ['Enrollment', (s) => (s.enrollment ? s.enrollment.toLocaleString() : '—')],
  ['Typical GPA', (s) => s.gpa_expectation || '—'],
  ['Last season', (s) => (s.recent_seasons[0] ? `${s.recent_seasons[0].season}: ${s.recent_seasons[0].record}` : '—')],
  ['Season before', (s) => (s.recent_seasons[1] ? `${s.recent_seasons[1].season}: ${s.recent_seasons[1].record}` : '—')],
  ['Best ranking', (s) => (s.best_ranking ? `#${s.best_ranking.rank} (${s.best_ranking.season})` : 'Not ranked')],
  ['NCAA tournament', (s) => (s.ncaa_recent ? 'Yes, recently' : s.recent_seasons.length ? 'Not recently' : '—')],
  ['Head coach', (s) => s.head_coach?.name || '—'],
  ['Coach email', (s) => (s.head_coach?.email ? <a className="text-lime-300 font-semibold break-all" href={`mailto:${s.head_coach.email}`}>{s.head_coach.email}</a> : <span className="text-slate-500 italic">Not publicly listed</span>)],
  ['Recruiting coordinator', (s) => (s.has_recruiting_coordinator ? 'Listed' : '—')],
  ['Runs ID camps', (s) => (s.has_id_camps ? 'Yes' : '—')],
  ['Next camp', (s) => (s.next_camp ? `${s.next_camp.camp_name} · ${s.next_camp.camp_date}` : '—')],
  ['Website', (s) => (s.team_website || s.athletics_website ? <ExtLink href={s.team_website || s.athletics_website}>Official site</ExtLink> : '—')],
];

export default function ComparePage() {
  const [sp] = useSearchParams();
  const ids = sp.get('ids') || '';
  const { data, isLoading, error } = useQuery({ queryKey: ['rc', 'compare', ids], queryFn: () => rc.get('/programs/compare', { ids }), enabled: !!ids });
  if (!ids) return <Empty title="Nothing to compare yet">Pick two to four schools with “Compare” on the schools page. <Link to="/schools" className="text-lime-300 font-semibold">Browse schools →</Link></Empty>;
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const list = data.programs;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black tracking-tight">Compare schools</h1>
      <div className={`${C.card} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-white/10"><th className="p-3 w-36" />{list.map((s) => (
              <th key={s.id} className="p-3 text-left align-top"><Link to={`/schools/${s.slug}`} className="font-black text-white text-base hover:text-lime-300">{s.school_name}</Link><div className="mt-2"><SaveButton program={s} /></div></th>
            ))}</tr>
          </thead>
          <tbody>
            {ROWS.map(([label, fn]) => (
              <tr key={label} className="border-b border-white/5 last:border-0"><td className="p-3 text-slate-400 font-semibold sticky left-0 bg-[#0e1729]">{label}</td>{list.map((s) => <td key={s.id} className="p-3 text-slate-100">{fn(s)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
