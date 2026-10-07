import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Check, Share2, ShieldCheck, ShieldQuestion, Loader2, MapPin, Trophy, CalendarDays, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { rc, useRcMutation, STAGE_LABEL, fmtDate } from './api';

/* Brand tokens: night pitch + floodlight lime. Explicit colours everywhere (no inherited white-on-white). */
export const C = {
  page: 'bg-[#060b16] text-slate-100',
  card: 'bg-[#0e1729] border border-white/10 rounded-2xl',
  cardHover: 'hover:border-lime-300/40 hover:bg-[#122038] transition-colors',
  muted: 'text-slate-400',
  input: 'w-full bg-[#0a1222] border border-white/15 rounded-xl px-3.5 py-2.5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none focus:border-lime-300/70',
};

export function Btn({ variant = 'primary', size = 'md', className = '', children, ...p }) {
  const v = {
    primary: 'bg-lime-300 text-slate-950 hover:bg-lime-200',
    secondary: 'bg-white/10 text-white hover:bg-white/15 border border-white/15',
    ghost: 'bg-transparent text-slate-200 hover:bg-white/10',
    danger: 'bg-red-500/90 text-white hover:bg-red-500',
    outline: 'bg-transparent text-lime-200 border border-lime-300/50 hover:bg-lime-300/10',
  }[variant];
  const s = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-[15px]', lg: 'px-6 py-3.5 text-base' }[size];
  return (
    <button type="button" {...p} className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${v} ${s} ${className}`}>
      {children}
    </button>
  );
}

export const Spinner = ({ className = '' }) => <Loader2 className={`animate-spin text-lime-300 ${className}`} />;
export const Loading = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-3 py-16 text-slate-400"><Spinner className="w-5 h-5" />{label}</div>
);
export const ErrorBox = ({ error }) => error ? (
  <div className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 px-4 py-3 text-sm">{error.message || String(error)}</div>
) : null;

export const Empty = ({ title, children }) => (
  <div className={`${C.card} p-8 text-center`}>
    <div className="text-white font-bold text-lg">{title}</div>
    {children && <div className="text-slate-400 mt-2 text-sm">{children}</div>}
  </div>
);

export const Chip = ({ children, tone = 'slate', className = '' }) => {
  const t = {
    slate: 'bg-white/10 text-slate-200', lime: 'bg-lime-300/15 text-lime-200', amber: 'bg-amber-400/15 text-amber-200',
    sky: 'bg-sky-400/15 text-sky-200', red: 'bg-red-400/15 text-red-200', violet: 'bg-violet-400/15 text-violet-200',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${t} ${className}`}>{children}</span>;
};

export const DivisionChip = ({ division }) => <Chip tone={division === 'D1' ? 'lime' : division === 'D2' ? 'sky' : 'violet'}>{division}</Chip>;

const STATUS = {
  verified: ['lime', 'Verified'], needs_review: ['amber', 'Needs review'], historical: ['violet', 'Historical'],
  unverified: ['slate', 'Unverified'], archived: ['red', 'Archived'],
};
export function VerificationBadge({ status, compact }) {
  const [tone, label] = STATUS[status] || STATUS.unverified;
  return <Chip tone={tone}>{status === 'verified' ? <ShieldCheck className="w-3 h-3" /> : <ShieldQuestion className="w-3 h-3" />}{compact ? '' : label}</Chip>;
}

export const Section = ({ title, action, children, id }) => (
  <section id={id} className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-black uppercase tracking-wide text-white">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

export const Stat = ({ label, value, sub }) => (
  <div className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-3">
    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-xl font-black text-white mt-0.5">{value || '—'}</div>
    {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
  </div>
);

export const Field = ({ label, hint, children }) => (
  <label className="block space-y-1.5">
    <span className="text-sm font-semibold text-slate-200">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-500">{hint}</span>}
  </label>
);

export const Input = (p) => <input {...p} className={`${C.input} ${p.className || ''}`} />;
export const Textarea = (p) => <textarea rows={4} {...p} className={`${C.input} ${p.className || ''}`} />;
export const Select = ({ children, ...p }) => <select {...p} className={`${C.input} ${p.className || ''}`}>{children}</select>;

/** Email is shown as a real mailto: link, or an honest "not listed" -- never guessed. */
export const CoachEmail = ({ email }) => email
  ? <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 text-lime-300 font-semibold hover:underline break-all"><Mail className="w-4 h-4 shrink-0" />{email}</a>
  : <span className="text-sm text-slate-500 italic">Email not publicly listed</span>;

export const ExtLink = ({ href, children, className = '' }) => href ? (
  <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={`text-lime-300 hover:underline break-words ${className}`}>{children}</a>
) : null;

export async function shareUrl(url, title) {
  const full = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  try {
    if (navigator.share) { await navigator.share({ title, url: full }); return; }
    await navigator.clipboard.writeText(full);
    toast.success('Link copied');
  } catch (e) {
    if (e?.name !== 'AbortError') toast.error('Could not share — copy the address bar instead.');
  }
}
export const ShareButton = ({ url, title, label = 'Share', className = '' }) => (
  <Btn variant="secondary" size="sm" className={className} onClick={() => shareUrl(url, title)}><Share2 className="w-4 h-4" />{label}</Btn>
);

/** Redirects to sign-in (remembering where she was) unless already signed in. */
export function useRequireAuth() {
  const { isAuthenticated } = useAuth();
  const nav = useNavigate(); const loc = useLocation();
  return () => {
    if (isAuthenticated) return true;
    nav(`/auth?next=${encodeURIComponent(loc.pathname + loc.search)}`);
    return false;
  };
}

/** Add to / already in My List -- the one-tap core action. */
export function SaveButton({ program, target, size = 'sm', className = '' }) {
  const need = useRequireAuth();
  const add = useRcMutation(() => rc.post('/me/targets', { program_id: program.id }), { onSuccess: () => toast.success(`${program.school_name} added to My List`) });
  const [busy, setBusy] = useState(false);
  if (target) {
    return (
      <Link to="/my-list" className={`inline-flex items-center gap-1.5 rounded-xl bg-lime-300/15 text-lime-200 font-semibold ${size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5'} ${className}`}>
        <BookmarkCheck className="w-4 h-4" />In My List · {STAGE_LABEL[target.stage] || target.stage}
      </Link>
    );
  }
  return (
    <Btn size={size} className={className} disabled={add.isPending || busy} onClick={async () => { if (!need()) return; setBusy(true); try { await add.mutateAsync(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } }}>
      {add.isPending ? <Spinner className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}Add to My List
    </Btn>
  );
}

export function SchoolAvatar({ school, size = 'w-12 h-12' }) {
  const initials = (school.school_name || '?').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return school.logo_url
    ? <img src={school.logo_url} alt="" className={`${size} rounded-xl object-contain bg-white/90 p-1 shrink-0`} loading="lazy" />
    : <div className={`${size} rounded-xl bg-gradient-to-br from-lime-300/25 to-sky-400/20 border border-white/10 flex items-center justify-center font-black text-lime-200 shrink-0`}>{initials}</div>;
}

export function RecordLine({ s }) {
  if (!s) return <span className="text-slate-500">—</span>;
  return <span className="font-bold text-white">{s.record || '—'}</span>;
}

/** The discovery card used by search, compare and the saved list. */
export function SchoolCard({ school, target, compareOn, onCompare, children }) {
  const r = school.recent_seasons?.[0];
  return (
    <div className={`${C.card} ${C.cardHover} p-4 flex flex-col gap-3`}>
      <Link to={`/schools/${school.slug}`} className="flex items-start gap-3 min-w-0">
        <SchoolAvatar school={school} />
        <div className="min-w-0 flex-1">
          <div className="font-black text-white text-[17px] leading-tight truncate">{school.school_name}</div>
          <div className="text-sm text-slate-400 truncate">{school.nickname ? `${school.nickname} · ` : ''}{school.conference || 'Conference n/a'}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DivisionChip division={school.division} />
            {school.state && <Chip><MapPin className="w-3 h-3" />{school.city ? `${school.city}, ` : ''}{school.state}</Chip>}
            {school.distance_miles != null && <Chip>{school.distance_miles === 0 ? 'In your state' : `~${school.distance_miles.toLocaleString()} mi`}</Chip>}
          </div>
        </div>
      </Link>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/5 py-2"><div className="text-[10px] uppercase tracking-wider text-slate-400">{r ? r.season : 'Record'}</div><div className="text-sm"><RecordLine s={r} /></div></div>
        <div className="rounded-lg bg-white/5 py-2"><div className="text-[10px] uppercase tracking-wider text-slate-400">Best rank</div><div className="text-sm font-bold text-white">{school.best_ranking ? `#${school.best_ranking.rank}` : '—'}</div></div>
        <div className="rounded-lg bg-white/5 py-2"><div className="text-[10px] uppercase tracking-wider text-slate-400">Next camp</div><div className="text-sm font-bold text-white">{school.next_camp ? fmtDate(school.next_camp.camp_date) : '—'}</div></div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {school.head_coach?.email
          ? <a href={`mailto:${school.head_coach.email}`} className="text-sm text-lime-300 font-semibold inline-flex items-center gap-1 min-w-0"><Mail className="w-4 h-4 shrink-0" /><span className="truncate">Email coach</span></a>
          : <span className="text-xs text-slate-500">Coach email not listed</span>}
        <div className="flex items-center gap-2">
          {onCompare && (
            <button type="button" onClick={onCompare} aria-pressed={compareOn} className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border ${compareOn ? 'bg-sky-400/20 border-sky-300/50 text-sky-100' : 'bg-white/5 border-white/15 text-slate-200'}`}>
              {compareOn ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" />Comparing</span> : 'Compare'}
            </button>
          )}
          {children || <SaveButton program={school} target={target} />}
        </div>
      </div>
    </div>
  );
}

export const IconStat = ({ icon: I, children }) => <span className="inline-flex items-center gap-1.5 text-sm text-slate-300"><I className="w-4 h-4 text-lime-300" />{children}</span>;
export { Trophy, CalendarDays };
