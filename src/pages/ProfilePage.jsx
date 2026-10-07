import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, Link2, Globe } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { rc, useMyProfile, useMeta, useRcMutation } from '../api';
import { C, Btn, Field, Input, Textarea, Select, Loading, ErrorBox, Section, ShareButton, Spinner } from '../ui';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'WB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'];
const PRIVACY = [
  ['private', Lock, 'Private', 'Only you. This is the default.'],
  ['unlisted', Link2, 'Unlisted', 'Anyone with your share link can view.'],
  ['public', Globe, 'Public', 'Anyone can find your page by its address.'],
];

export default function ProfilePage() {
  const { isAuthenticated, user, logout } = useAuth();
  const [sp] = useSearchParams();
  const { data, isLoading, error } = useMyProfile(isAuthenticated);
  const { data: meta } = useMeta();
  const [f, setF] = useState(null);
  const save = useRcMutation((body) => rc.put('/me/profile', body), { onSuccess: () => toast.success('Profile saved') });
  const rotate = useRcMutation(() => rc.post('/me/profile/rotate-share-token'), { onSuccess: () => toast.success('New share link created — the old one no longer works') });

  useEffect(() => {
    if (!data?.profile) return;
    const p = data.profile;
    setF({
      ...p, positions: p.positions || [], academic_interests: (p.academic_interests || []).join(', '), highlight_links: (p.highlight_links || []).join('\n'),
      preferred_regions: p.preferred_regions || [], grad_year: p.grad_year || '', gpa: p.gpa ?? '',
    });
  }, [data]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-10">
        <h1 className="text-3xl font-black">Player profile</h1>
        <p className="text-slate-400">Create a free account to build your recruiting profile.</p>
        <Link to="/auth?next=/profile"><Btn size="lg">Create account / sign in</Btn></Link>
      </div>
    );
  }
  if (isLoading || !f) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((i) => i !== v) : [...x[k], v] }));
  const submit = (e) => {
    e.preventDefault();
    save.mutate({
      ...f,
      academic_interests: f.academic_interests, highlight_links: f.highlight_links.split('\n').map((s) => s.trim()).filter(Boolean),
      positions: f.positions, preferred_regions: f.preferred_regions,
    }, { onError: (err) => toast.error(err.message) });
  };
  const p = data.profile;
  const sharePage = p.slug && p.privacy !== 'private' ? `/player/${p.slug}${p.privacy === 'unlisted' ? `?t=${p.share_token}` : ''}` : null;
  const Chipbtn = ({ on, onClick, children }) => (
    <button type="button" onClick={onClick} aria-pressed={on} className={`rounded-lg px-3 py-1.5 text-sm font-bold border ${on ? 'bg-red-600 text-white border-red-500' : 'bg-white/5 text-slate-200 border-white/15'}`}>{children}</button>
  );

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{sp.get('welcome') ? 'Welcome! Set up the player' : 'Player profile'}</h1>
        <p className="text-slate-400 text-sm">Signed in as {user?.email}. Everything here is private unless you change sharing below.</p>
      </div>

      <Section title="Player">
        <div className={`${C.card} p-4 grid sm:grid-cols-2 gap-4`}>
          <Field label="First name"><Input value={f.first_name || ''} onChange={set('first_name')} required /></Field>
          <Field label="Last name"><Input value={f.last_name || ''} onChange={set('last_name')} /></Field>
          <Field label="Graduation year"><Select value={f.grad_year} onChange={set('grad_year')}><option value="">Select</option>{[0, 1, 2, 3, 4, 5].map((o) => <option key={o} value={new Date().getFullYear() + o}>{new Date().getFullYear() + o}</option>)}</Select></Field>
          <Field label="Height"><Input value={f.height || ''} onChange={set('height')} placeholder={'5\'7"'} /></Field>
          <div className="sm:col-span-2"><Field label="Positions"><div className="flex flex-wrap gap-2">{POSITIONS.map((x) => <Chipbtn key={x} on={f.positions.includes(x)} onClick={() => toggle('positions', x)}>{x}</Chipbtn>)}</div></Field></div>
          <Field label="Primary position"><Select value={f.primary_position || ''} onChange={set('primary_position')}><option value="">Select</option>{f.positions.map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Club team"><Input value={f.club || ''} onChange={set('club')} /></Field>
          <Field label="High school"><Input value={f.high_school || ''} onChange={set('high_school')} /></Field>
          <Field label="Home state"><Select value={f.state || ''} onChange={set('state')}><option value="">Select</option>{(meta?.states || []).map((s) => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}</Select></Field>
          <Field label="City"><Input value={f.city || ''} onChange={set('city')} /></Field>
          <Field label="GPA"><Input type="number" step="0.01" min="0" max="5" value={f.gpa} onChange={set('gpa')} /></Field>
          <div className="sm:col-span-2"><Field label="Academic interests" hint="Comma separated"><Input value={f.academic_interests} onChange={set('academic_interests')} placeholder="Nursing, Engineering" /></Field></div>
          <div className="sm:col-span-2"><Field label="Preferred regions"><div className="flex flex-wrap gap-2">{(meta?.regions || []).map((r) => <Chipbtn key={r} on={f.preferred_regions.includes(r)} onClick={() => toggle('preferred_regions', r)}>{r}</Chipbtn>)}</div></Field></div>
          <Field label="Recruiting status"><Select value={f.recruiting_status || 'exploring'} onChange={set('recruiting_status')}><option value="exploring">Exploring</option><option value="actively_recruiting">Actively recruiting</option><option value="committed">Committed</option><option value="not_recruiting">Not recruiting</option></Select></Field>
        </div>
      </Section>

      <Section title="Highlights & bio">
        <div className={`${C.card} p-4 space-y-4`}>
          <Field label="Highlight / video links" hint="One link per line (YouTube, Hudl, Vimeo…)"><Textarea rows={3} value={f.highlight_links} onChange={set('highlight_links')} /></Field>
          <Field label="Player bio"><Textarea rows={4} value={f.bio || ''} onChange={set('bio')} maxLength={2000} /></Field>
        </div>
      </Section>

      <Section title="Private contact details">
        <div className={`${C.card} p-4 grid sm:grid-cols-2 gap-4`}>
          <div className="sm:col-span-2 text-xs text-slate-400">These are never shown on your shared page, even if your profile is public.</div>
          <Field label="Player email"><Input type="email" value={f.email || ''} onChange={set('email')} /></Field>
          <Field label="Player phone"><Input type="tel" value={f.phone || ''} onChange={set('phone')} /></Field>
          <Field label="Parent / guardian name"><Input value={f.guardian_name || ''} onChange={set('guardian_name')} /></Field>
          <Field label="Guardian email"><Input type="email" value={f.guardian_email || ''} onChange={set('guardian_email')} /></Field>
          <Field label="Guardian phone"><Input type="tel" value={f.guardian_phone || ''} onChange={set('guardian_phone')} /></Field>
        </div>
      </Section>

      <Section title="Privacy & sharing" id="sharing">
        <div className={`${C.card} p-4 space-y-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PRIVACY.map(([v, Icon, label, desc]) => (
              <button key={v} type="button" onClick={() => setF((x) => ({ ...x, privacy: v }))} aria-pressed={f.privacy === v} className={`text-left rounded-xl border p-3 ${f.privacy === v ? 'border-red-500 bg-red-500/10' : 'border-white/15 bg-white/5'}`}>
                <div className="flex items-center gap-2 font-bold text-white"><Icon className="w-4 h-4 text-red-400" />{label}</div><div className="text-xs text-slate-400 mt-1">{desc}</div>
              </button>
            ))}
          </div>
          <Field label="Display name on your shared page" hint="Leave blank to show first name + last initial, e.g. “Ava S.”"><Input value={f.display_name || ''} onChange={set('display_name')} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={!!f.share_list} onChange={(e) => setF((x) => ({ ...x, share_list: e.target.checked }))} className="accent-red-500 w-4 h-4" />Include my target school names (no notes, stages or contact history)</label>
          <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={!!f.public_show_gpa} onChange={(e) => setF((x) => ({ ...x, public_show_gpa: e.target.checked }))} className="accent-red-500 w-4 h-4" />Show my GPA on my shared page</label>
          {f.privacy !== 'private' && !p.onboarded && <div className="text-xs text-amber-200">Save your profile first to get your share links.</div>}
          {sharePage && (
            <div className="rounded-xl bg-white/5 p-3 space-y-2">
              <div className="text-xs text-slate-400">Your player page</div>
              <div className="text-sm text-red-400 break-all">{window.location.origin}{sharePage}</div>
              <div className="flex gap-2 flex-wrap"><ShareButton url={sharePage} title="My soccer recruiting profile" label="Share profile" /><Btn variant="ghost" size="sm" onClick={() => { if (window.confirm('Create a new link? The old one will stop working.')) rotate.mutate(); }}>Reset link</Btn></div>
              {p.share_list && <div className="text-xs text-slate-400 pt-1">List link: <span className="text-red-400 break-all">{window.location.origin}/list/{p.share_token}</span></div>}
            </div>
          )}
        </div>
      </Section>

      <div className="sticky bottom-20 md:bottom-4 z-20 flex gap-2 justify-between items-center rounded-2xl bg-[#0a1222]/95 border border-white/10 backdrop-blur p-3">
        <Btn type="button" variant="ghost" size="sm" onClick={() => logout(false)}>Sign out</Btn>
        <Btn type="submit" size="lg" disabled={save.isPending}>{save.isPending && <Spinner className="w-4 h-4" />}Save profile</Btn>
      </div>
    </form>
  );
}
