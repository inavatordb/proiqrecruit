import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Users, CalendarDays, Bookmark, Trophy, BookOpenCheck } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useMeta, useDashboard, STAGE_LABEL, fmtDate } from '../api';
import { C, Btn, Section, Stat, Chip } from '../ui';

const STEPS = [
  [Search, 'Discover', 'Search every D1 and D2 women\'s program by location, conference, results and rankings.'],
  [Trophy, 'Research', 'See the last three seasons, national rankings, and the full coaching staff.'],
  [Bookmark, 'Save', 'One tap puts a school on your list and into your recruiting pipeline.'],
  [CalendarDays, 'Show up', 'Track official camps and ID events, then log every conversation with a coach.'],
];

export default function HomePage() {
  const nav = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { data: meta } = useMeta();
  const { data: dash } = useDashboard(isAuthenticated);
  const [q, setQ] = useState('');
  const count = (d) => meta?.divisions?.find((x) => x.id === d)?.count;
  const go = (e) => { e.preventDefault(); nav(`/schools${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); };
  const pipeline = dash ? dash.cards.reduce((m, c) => ({ ...m, [c.stage]: (m[c.stage] || 0) + 1 }), {}) : {};
  const nextCamp = dash?.upcoming_camps?.[0];

  return (
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f2a1d] via-[#0b1830] to-[#060b16] p-6 sm:p-10">
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-lime-300/10 blur-3xl" />
        <div className="relative max-w-2xl space-y-5">
          <Chip tone="lime">Women's Soccer · NCAA D1 & D2</Chip>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">Find the program.<br />Run your own recruiting.</h1>
          <p className="text-slate-300 text-lg">Every program, every coach, every camp — with the sources to prove it. Built for players and families.</p>
          <form onSubmit={go} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a school, state or conference" className={`${C.input} pl-11 py-3.5 text-base`} />
            </div>
            <Btn type="submit" size="lg">Search</Btn>
          </form>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link to="/schools?division=D1" className="rounded-full bg-white/10 px-3.5 py-1.5 font-semibold hover:bg-white/15">Division I{count('D1') ? ` · ${count('D1')}` : ''}</Link>
            <Link to="/schools?division=D2" className="rounded-full bg-white/10 px-3.5 py-1.5 font-semibold hover:bg-white/15">Division II{count('D2') ? ` · ${count('D2')}` : ''}</Link>
            <Link to="/camps?when=upcoming" className="rounded-full bg-white/10 px-3.5 py-1.5 font-semibold hover:bg-white/15">Upcoming camps</Link>
          </div>
        </div>
      </div>

      {isAuthenticated && dash && (
        <Section title={`Your recruiting${user?.full_name ? ` · ${user.full_name.split(' ')[0]}` : ''}`} action={<Link to="/my-list" className="text-sm font-semibold text-lime-300 inline-flex items-center gap-1">Open My List <ArrowRight className="w-4 h-4" /></Link>}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Schools saved" value={dash.cards.length} />
            <Stat label="In contact" value={(pipeline.contacted || 0) + (pipeline.coach_responded || 0)} sub={`${pipeline.coach_responded || 0} responded`} />
            <Stat label="Upcoming camps" value={dash.upcoming_camps.length} sub={nextCamp ? `${nextCamp.school_name} · ${fmtDate(nextCamp.camp_date)}` : 'None on your list yet'} />
            <Stat label="Follow-ups due" value={dash.follow_ups.length} sub={dash.follow_ups[0] ? `${dash.follow_ups[0].school_name} · ${fmtDate(dash.follow_ups[0].follow_up_date)}` : ''} />
          </div>
          {!dash.profile.onboarded && (
            <div className={`${C.card} p-4 flex items-center justify-between gap-3`}>
              <div className="text-sm text-slate-300">Finish your player profile so your list can show distance and fit.</div>
              <Link to="/profile"><Btn size="sm">Set up profile</Btn></Link>
            </div>
          )}
        </Section>
      )}

      {!isAuthenticated && (
        <div className={`${C.card} p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
          <div>
            <div className="font-black text-xl">Create your free recruiting account</div>
            <div className="text-slate-400 text-sm mt-1">Save schools, keep private notes, and track every coach conversation. Each family's data is private to them.</div>
          </div>
          <Link to="/auth"><Btn size="lg">Get started</Btn></Link>
        </div>
      )}

      <Section title="How it works">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STEPS.map(([Icon, t, d], i) => (
            <div key={t} className={`${C.card} p-4 space-y-2`}>
              <div className="flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-lime-300/15 text-lime-300 flex items-center justify-center"><Icon className="w-4 h-4" /></span><span className="text-xs font-bold text-slate-500">0{i + 1}</span></div>
              <div className="font-black text-white">{t}</div>
              <div className="text-sm text-slate-400">{d}</div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={`${C.card} p-5 space-y-2`}>
          <div className="flex items-center gap-2 font-black"><BookOpenCheck className="w-5 h-5 text-lime-300" />Sourced, never guessed</div>
          <p className="text-sm text-slate-400">Every record links back to where it came from. If a coach's email isn't publicly listed, we say so instead of guessing — and official university camps are always kept separate from third-party ID events.</p>
        </div>
        <div className={`${C.card} p-5 space-y-2`}>
          <div className="flex items-center gap-2 font-black"><Users className="w-5 h-5 text-lime-300" />Built to grow</div>
          <p className="text-sm text-slate-400">D1 and D2 women's soccer first. D3, NAIA and junior college programs — and more sports — are on the way.</p>
        </div>
      </div>
    </div>
  );
}
