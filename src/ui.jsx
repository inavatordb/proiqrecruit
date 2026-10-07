import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Check, Share2, ShieldCheck, ShieldQuestion, Loader2, MapPin, Trophy, CalendarDays, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { rc, useRcMutation, STAGE_LABEL, fmtDate } from './api';

/* Pro IQ Recruits look: brushed-steel panels on near-black, signal-red accents, italic condensed headlines. */
const METAL = 'bg-gradient-to-b from-[#202228] to-[#111317]';
export const C = {
  page: 'bg-[#07080a] text-slate-100',
  card: `${METAL} border border-white/10 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_6px_18px_rgba(0,0,0,.45)]`,
  // School cards get the red tab on top, like a broadcast lower-third.
  cardAccent: 'relative before:content-[""] before:absolute before:-top-px before:right-6 before:h-[3px] before:w-16 before:rounded-b before:bg-red-600',
  cardHover: 'hover:border-red-500/50 transition-colors',
  inset: 'bg-black/45 border border-white/15 rounded-md shadow-[inset_0_2px_6px_rgba(0,0,0,.6)]',
  muted: 'text-slate-400',
  input: 'w-full bg-black/40 border border-white/15 rounded-lg px-3.5 py-2.5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500 shadow-[inset_0_2px_5px_rgba(0,0,0,.5)]',
};

/** Primary buttons are red parallelograms; the label is un-skewed so text stays upright. */
export function Btn({ variant = 'primary', size = 'md', className = '', children, ...p }) {
  const v = {
    primary: 'bg-gradient-to-b from-red-500 to-red-700 text-white hover:from-red-400 hover:to-red-600 shadow-[0_2px_0_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.3)] -skew-x-6',
    secondary: 'bg-gradient-to-b from-[#2a2d34] to-[#17191e] text-white hover:from-[#33363f] border border-white/15',
    ghost: 'bg-transparent text-slate-200 hover:bg-white/10',
    danger: 'bg-red-700 text-white hover:bg-red-600',
    outline: 'bg-transparent text-red-300 border border-red-500/60 hover:bg-red-500/10',
  }[variant];
  const s = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-[15px]', lg: 'px-6 py-3.5 text-base' }[size];
  const skewed = variant === 'primary';
  return (
    <button type="button" {...p} className={`inline-flex items-center justify-center gap-2 rounded-md font-bold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${v} ${s} ${className}`}>
      {skewed ? <span className="inline-flex items-center justify-center gap-2 skew-x-6">{children}</span> : children}
    </button>
  );
}

export const Spinner = ({ className = '' }) => <Loader2 className={`animate-spin text-red-400 ${className}`} />;
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
    slate: 'bg-white/10 text-slate-200', lime: 'bg-emerald-400/15 text-emerald-200', amber: 'bg-amber-400/15 text-amber-200',
    sky: 'bg-sky-400/15 text-sky-200', red: 'bg-red-600 text-white', violet: 'bg-violet-400/15 text-violet-200',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${t} ${className}`}>{children}</span>;
};

export const DivisionChip = ({ division }) => <Chip tone={division === 'D1' ? 'red' : division === 'D2' ? 'sky' : 'violet'}>{division}</Chip>;

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
  <div className={`${C.inset} px-3.5 py-3`}>
    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-2xl font-black italic text-white mt-0.5">{value || '—'}</div>
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
  ? <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 text-red-400 font-semibold hover:underline break-all"><Mail className="w-4 h-4 shrink-0" />{email}</a>
  : <span className="text-sm text-slate-500 italic">Email not publicly listed</span>;

export const ExtLink = ({ href, children, className = '' }) => href ? (
  <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={`text-red-400 hover:underline break-words ${className}`}>{children}</a>
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
      <Link to="/my-list" className={`inline-flex items-center gap-1.5 rounded-xl bg-red-500/15 text-red-300 font-semibold ${size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5'} ${className}`}>
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

/** School logo on a light tile (so dark logos stay visible); initials if there is no logo or it fails to load. */
export function SchoolAvatar({ school, size = 'w-14 h-14' }) {
  const [failed, setFailed] = useState(false);
  const initials = (school.school_name || '?').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return school.logo_url && !failed
    ? (
      <span className={`${size} shrink-0 rounded-lg bg-gradient-to-br from-white to-zinc-300 border border-white/30 shadow-[inset_0_-3px_6px_rgba(0,0,0,.25),0_2px_6px_rgba(0,0,0,.5)] flex items-center justify-center p-1.5`}>
        <img src={school.logo_url} alt={`${school.school_name} logo`} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} className="max-w-full max-h-full object-contain" />
      </span>
    )
    : <span className={`${size} rounded-lg bg-gradient-to-br from-[#2c2f36] to-[#15171b] border border-red-500/40 flex items-center justify-center font-black italic text-red-400 shrink-0`}>{initials}</span>;
}

export function RecordLine({ s }) {
  if (!s) return <span className="text-slate-500">—</span>;
  return <span className="font-bold text-white">{s.record || '—'}</span>;
}

/** The discovery card used by search, compare and the saved list. */
export function SchoolCard({ school, target, compareOn, onCompare, children }) {
  const r = school.recent_seasons?.[0];
  const stat = (label, value) => (
    <div className={`${C.inset} py-1.5 text-center`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-lg font-black italic leading-tight text-white">{value}</div>
    </div>
  );
  return (
    <div className={`${C.card} ${C.cardAccent} ${C.cardHover} p-3.5 flex flex-col gap-3`}>
      <Link to={`/schools/${school.slug}`} className="flex items-start gap-3 min-w-0">
        <SchoolAvatar school={school} size="w-16 h-16" />
        <div className="min-w-0 flex-1">
          <div className="font-black italic text-white text-xl leading-tight truncate">{school.school_name}</div>
          <div className="text-sm text-slate-400 truncate">{school.nickname ? `${school.nickname} · ` : ''}{school.conference || 'Conference n/a'}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DivisionChip division={school.division} />
            {school.state && <Chip><MapPin className="w-3 h-3" />{school.city ? `${school.city}, ` : ''}{school.state}</Chip>}
            {school.distance_miles != null && <Chip>{school.distance_miles === 0 ? 'In your state' : `~${school.distance_miles.toLocaleString()} mi`}</Chip>}
          </div>
        </div>
      </Link>
      <div className="grid grid-cols-3 gap-2">
        {stat(r ? r.season : 'Record', r?.record || '—')}
        {stat('Best rank', school.best_ranking ? `#${school.best_ranking.rank}` : '—')}
        {stat('Next camp', school.next_camp ? fmtDate(school.next_camp.camp_date) : '—')}
      </div>
      <div className="flex items-center justify-between gap-2">
        {school.head_coach?.email
          ? <a href={`mailto:${school.head_coach.email}`} aria-label="Email head coach" title="Email head coach" className="w-9 h-9 shrink-0 rounded-md bg-gradient-to-b from-[#2a2d34] to-[#17191e] border border-white/15 text-white flex items-center justify-center hover:text-red-400"><Mail className="w-4 h-4" /></a>
          : <span title="Email not publicly listed" aria-label="Email not publicly listed" className="w-9 h-9 shrink-0 rounded-md bg-black/30 border border-white/10 text-slate-600 flex items-center justify-center"><Mail className="w-4 h-4" /></span>}
        <div className="flex items-center gap-2">
          {onCompare && (
            <button type="button" onClick={onCompare} aria-pressed={compareOn} className={`text-sm font-bold rounded-md px-3 py-2 border ${compareOn ? 'bg-sky-500/25 border-sky-300/60 text-sky-100' : 'bg-gradient-to-b from-[#2a2d34] to-[#17191e] border-white/15 text-slate-100 hover:text-white'}`}>
              {compareOn ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" />Comparing</span> : 'Compare'}
            </button>
          )}
          {children || <SaveButton program={school} target={target} />}
        </div>
      </div>
    </div>
  );
}

export const IconStat = ({ icon: I, children }) => <span className="inline-flex items-center gap-1.5 text-sm text-slate-300"><I className="w-4 h-4 text-red-400" />{children}</span>;
export { Trophy, CalendarDays };
