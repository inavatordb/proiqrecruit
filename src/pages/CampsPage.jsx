import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MapPin, CalendarDays, DollarSign, Users, ShieldAlert, ExternalLink as ExtIcon } from 'lucide-react';
import { toast } from 'sonner';
import { rc, useCamps, useRcMutation, fmtDate, fmtDateLong } from '../api';
import { useQuery } from '@tanstack/react-query';
import { C, Btn, Chip, DivisionChip, Loading, ErrorBox, Empty, ExtLink, ShareButton, VerificationBadge, Select, Field, useRequireAuth, Spinner, SchoolAvatar } from '../ui';

const cost = (c) => (c ? (/^\d+(\.\d+)?$/.test(c) ? `$${c}` : c) : '');

export function CampMeta({ camp }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
      <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-red-400" />{fmtDateLong(camp.camp_date)}{camp.end_date && camp.end_date !== camp.camp_date ? ` – ${fmtDateLong(camp.end_date)}` : ''}</span>
      {camp.location && <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-red-400" />{camp.location}</span>}
      {camp.cost && <span className="inline-flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-red-400" />{cost(camp.cost)}</span>}
      {(camp.age_range || camp.graduation_years?.length > 0) && <span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4 text-red-400" />{[camp.age_range, camp.graduation_years?.length ? `Class of ${camp.graduation_years.join(', ')}` : ''].filter(Boolean).join(' · ')}</span>}
    </div>
  );
}

/** A university-run camp. Always marked official; unverified ones say so plainly. */
export function CampRow({ camp, program, workspace, signedIn, showSchool = true }) {
  const need = useRequireAuth();
  const mine = workspace?.camps?.find((x) => x.camp_id === camp.id);
  const track = useRcMutation((status) => rc.post('/me/camps', { camp_id: camp.id, status }), { onSuccess: () => toast.success('Camp saved to your plan') });
  const school = program || camp.program;
  return (
    <div className={`${C.card} p-4 sm:p-5 space-y-3.5`}>
      {showSchool && school ? (
        <div className="flex items-start gap-3.5 pb-3.5 border-b border-white/10">
          <Link to={`/schools/${school.slug}`} className="shrink-0"><SchoolAvatar school={school} size="w-14 h-14 sm:w-16 sm:h-16" /></Link>
          <div className="min-w-0 flex-1">
            <Link to={`/schools/${school.slug}`} className="block text-xl sm:text-2xl font-black text-white leading-tight tracking-tight break-words hover:text-red-400">{school.school_name}</Link>
            <Link to={`/camps/${camp.id}`} className="block text-sm sm:text-[15px] text-slate-300 mt-0.5 break-words hover:text-red-400">{camp.camp_name}</Link>
          </div>
        </div>
      ) : (
        <Link to={`/camps/${camp.id}`} className="block font-black text-white text-xl leading-tight break-words hover:text-red-400">{camp.camp_name}</Link>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {school && showSchool && <DivisionChip division={school.division} />}
        <Chip>{camp.camp_type}</Chip>
        <Chip tone="lime">Official University Camp</Chip>
        {camp.verification_status === 'verified' ? <VerificationBadge status="verified" /> : <Chip tone="amber"><ShieldAlert className="w-3 h-3" />Camp information not verified</Chip>}
        {!camp.upcoming && <Chip>Past</Chip>}
      </div>
      <div className="rounded-lg bg-black/30 border border-white/10 px-3.5 py-2.5"><CampMeta camp={camp} /></div>
      {camp.registration_deadline && <div className="text-xs text-amber-200">Register by {fmtDateLong(camp.registration_deadline)}</div>}
      {camp.description && <p className="text-sm text-slate-400 line-clamp-3">{camp.description}</p>}
      <div className="flex flex-wrap items-center gap-2 pt-3.5 border-t border-white/10">
        {camp.registration_url && <a href={camp.registration_url} target="_blank" rel="noopener noreferrer nofollow"><Btn size="sm">Register <ExtIcon className="w-3.5 h-3.5" /></Btn></a>}
        {camp.official_camp_url && <a href={camp.official_camp_url} target="_blank" rel="noopener noreferrer nofollow"><Btn variant="secondary" size="sm">School camp page</Btn></a>}
        {camp.contact_email && <a href={`mailto:${camp.contact_email}`} className="text-sm text-red-400 font-semibold">{camp.contact_email}</a>}
        {camp.upcoming && (
          <Select value={mine?.status || ''} onChange={(e) => { if (!need()) return; if (e.target.value) track.mutate(e.target.value); }} className="!w-auto !py-1.5 !text-sm ml-auto" aria-label="Track this camp">
            <option value="">Track camp…</option><option value="interested">Interested</option><option value="registered">Registered</option><option value="attended">Attended</option>
          </Select>
        )}
        {!camp.upcoming && signedIn && (
          <Select value={mine?.status || ''} onChange={(e) => { if (e.target.value) track.mutate(e.target.value); }} className="!w-auto !py-1.5 !text-sm ml-auto" aria-label="Mark attendance">
            <option value="">Did you go?</option><option value="attended">I attended</option><option value="skipped">I didn't go</option>
          </Select>
        )}
        {track.isPending && <Spinner className="w-4 h-4" />}
      </div>
    </div>
  );
}

/** Third-party event. Deliberately a different colour and label from CampRow. */
export function ExternalEventRow({ event }) {
  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.04] p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-bold text-white">{event.event_name}</div>
        <Chip tone="amber">External ID Camp / Recruiting Appearance</Chip>
        {event.verification_status !== 'verified' && <Chip>Unverified</Chip>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-amber-300" />{fmtDateLong(event.event_date)}</span>
        {event.event_organization && <span>Run by {event.event_organization}</span>}
        {event.location && <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-amber-300" />{event.location}</span>}
        {event.event_type && <span>{event.event_type}</span>}
      </div>
      {(event.advertised_coach || event.advertised_school) && <div className="text-xs text-slate-400">Advertised as: {[event.advertised_school, event.advertised_coach].filter(Boolean).join(' · ')}</div>}
      <div className="flex flex-wrap gap-3 text-sm">
        {event.registration_url && <ExtLink href={event.registration_url}>Event registration →</ExtLink>}
        {event.source_url && <ExtLink href={event.source_url}>Source →</ExtLink>}
      </div>
      <div className="text-[11px] text-amber-200/70">Not an official university camp. Confirm attendance with the program directly.</div>
    </div>
  );
}

export default function CampsPage() {
  const [sp, setSp] = useSearchParams();
  const params = Object.fromEntries(sp.entries());
  const when = params.when || 'upcoming';
  const { data, isLoading, error } = useCamps({ ...params, when, limit: 100 });
  const set = (patch) => { const n = { ...params, ...patch }; for (const k of Object.keys(n)) if (!n[k]) delete n[k]; setSp(n, { replace: true }); };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Official camps</h1>
        <p className="text-slate-400 text-sm">Camps hosted by the universities themselves. Third-party ID events are listed separately on each school's page.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="When"><Select value={when} onChange={(e) => set({ when: e.target.value })}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All</option></Select></Field>
        <Field label="Level"><Select value={params.division || ''} onChange={(e) => set({ division: e.target.value })}><option value="">D1 & D2</option><option value="D1">Division I</option><option value="D2">Division II</option></Select></Field>
        <Field label="Type"><Select value={params.type || ''} onChange={(e) => set({ type: e.target.value })}><option value="">Any type</option>{['ID Camp', 'Elite ID Camp', 'Residential Camp', 'College ID Camp', 'Prospect Camp', 'Youth Camp', 'Goalkeeper Camp', 'Team Camp', 'Summer Camp'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Year"><Select value={params.year || ''} onChange={(e) => set({ year: e.target.value })}><option value="">Any</option>{[0, 1].map((o) => <option key={o} value={new Date().getFullYear() - o}>{new Date().getFullYear() - o}</option>)}</Select></Field>
      </div>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : data?.results?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{data.results.map((c) => <CampRow key={c.id} camp={c} signedIn />)}</div>
      ) : <Empty title="No camps listed yet">Camp listings are added school by school from official camp pages, so this list grows over time. Check a school's page for its official camps link.</Empty>}
    </div>
  );
}

export function CampPage() {
  const { id } = useParams();
  const { data: camp, isLoading, error } = useQuery({ queryKey: ['rc', 'camp', id], queryFn: () => rc.get(`/camps/${id}`) });
  if (isLoading) return <Loading />;
  if (error) return <div className="space-y-3"><ErrorBox error={error} /><Link to="/camps" className="text-red-400 font-semibold">← All camps</Link></div>;
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link to="/camps" className="text-sm text-red-400 font-semibold">← All camps</Link>
      <div className={`${C.card} p-5 space-y-4`}>
        <div className="flex flex-wrap gap-1.5"><Chip tone="lime">Official University Camp</Chip><Chip>{camp.camp_type}</Chip>{camp.program && <DivisionChip division={camp.program.division} />}
          {camp.verification_status === 'verified' ? <VerificationBadge status="verified" /> : <Chip tone="amber"><ShieldAlert className="w-3 h-3" />Camp information not verified</Chip>}</div>
        <h1 className="text-3xl font-black tracking-tight">{camp.camp_name}</h1>
        {camp.program && <Link to={`/schools/${camp.program.slug}`} className="text-lg text-red-400 font-semibold block">{camp.program.school_name} Women's Soccer →</Link>}
        <CampMeta camp={camp} />
        {camp.registration_deadline && <div className="text-sm text-amber-200">Registration deadline: {fmtDateLong(camp.registration_deadline)}</div>}
        {camp.description && <p className="text-slate-300 leading-relaxed whitespace-pre-line">{camp.description}</p>}
        <div className="flex flex-wrap gap-2">
          {camp.registration_url && <a href={camp.registration_url} target="_blank" rel="noopener noreferrer nofollow"><Btn>Register</Btn></a>}
          {camp.official_camp_url && <a href={camp.official_camp_url} target="_blank" rel="noopener noreferrer nofollow"><Btn variant="secondary">Official camp page</Btn></a>}
          <ShareButton url={`/camps/${camp.id}`} title={camp.camp_name} />
        </div>
        {camp.contact_email && <div className="text-sm">Contact: <a className="text-red-400 font-semibold" href={`mailto:${camp.contact_email}`}>{camp.contact_email}</a>{camp.contact_phone ? ` · ${camp.contact_phone}` : ''}</div>}
        {camp.source_url && <div className="text-xs text-slate-500">Source: <ExtLink href={camp.source_url}>{camp.source_url.replace(/^https?:\/\//, '').slice(0, 70)}</ExtLink>{camp.last_verified_at ? ` · verified ${fmtDate(camp.last_verified_at, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</div>}
      </div>
    </div>
  );
}
