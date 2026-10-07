import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Ruler, GraduationCap, School, Play } from 'lucide-react';
import { rc } from '../api';
import { C, Chip, DivisionChip, Loading, ErrorBox, Section, Btn, ExtLink } from '../ui';

/** Public, read-only views: a player's shared page and a shared school list. The API returns no private fields. */
export default function SharedPages({ kind }) {
  const { slug, token } = useParams();
  const [sp] = useSearchParams();
  const t = sp.get('t');
  const { data: p, isLoading, error } = useQuery({
    queryKey: ['rc', 'share', kind, slug || token, t],
    queryFn: () => (kind === 'player' ? rc.get(`/share/player/${slug}`, { t }) : rc.get(`/share/list/${token}`)),
    retry: false,
  });
  if (isLoading) return <Loading />;
  if (error) return <div className="max-w-md mx-auto text-center space-y-3 py-12"><ErrorBox error={error} /><Link to="/"><Btn variant="secondary">Back to Pro IQ Recruits</Btn></Link></div>;
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className={`${C.card} p-6 space-y-4`}>
        <div className="text-xs font-bold uppercase tracking-widest text-red-400">{kind === 'list' ? 'Recruiting target list' : "Women's soccer recruiting profile"}</div>
        <h1 className="text-4xl font-black tracking-tight">{p.name}</h1>
        <div className="flex flex-wrap gap-2">
          {p.grad_year && <Chip tone="lime"><GraduationCap className="w-3 h-3" />Class of {p.grad_year}</Chip>}
          {p.positions?.map((x) => <Chip key={x} tone={x === p.primary_position ? 'sky' : 'slate'}>{x}</Chip>)}
          {p.height && <Chip><Ruler className="w-3 h-3" />{p.height}</Chip>}
          {p.state && <Chip>{p.state}</Chip>}
          {p.gpa != null && <Chip>GPA {Number(p.gpa).toFixed(2)}</Chip>}
        </div>
        <div className="text-sm text-slate-300 space-y-0.5">
          {p.club && <div>Club: <b className="text-white">{p.club}</b></div>}
          {p.high_school && <div>High school: <b className="text-white">{p.high_school}</b></div>}
          {p.academic_interests?.length > 0 && <div>Interested in: {p.academic_interests.join(', ')}</div>}
        </div>
        {p.bio && <p className="text-slate-200 leading-relaxed whitespace-pre-line">{p.bio}</p>}
        {p.highlight_links?.length > 0 && (
          <div className="flex flex-wrap gap-2">{p.highlight_links.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow"><Btn variant="outline" size="sm"><Play className="w-4 h-4" />Highlights {p.highlight_links.length > 1 ? i + 1 : ''}</Btn></a>)}</div>
        )}
        <div className="text-xs text-slate-500">Contact details are private. Coaches: reach this player through her club or high school.</div>
      </div>
      {p.target_schools?.length > 0 && (
        <Section title="Schools of interest">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {p.target_schools.map((s) => (
              <Link key={s.slug} to={`/schools/${s.slug}`} className={`${C.card} ${C.cardHover} p-3 flex items-center gap-3`}>
                <School className="w-5 h-5 text-red-400 shrink-0" />
                <div className="min-w-0"><div className="font-bold text-white truncate">{s.school_name}</div><div className="text-xs text-slate-400 truncate">{s.conference} · {s.state}</div></div>
                <DivisionChip division={s.division} />
              </Link>
            ))}
          </div>
        </Section>
      )}
      <div className="text-center"><ExtLink href="/">Build your own recruiting list →</ExtLink></div>
    </div>
  );
}
