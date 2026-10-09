import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { rc, useDashboard, useRcMutation, STAGE_LABEL, fmtDate } from '../api';
import { C, Btn, Chip, Empty, Loading, ErrorBox, SchoolCard, Section, Select, ShareButton, Stat, DivisionChip } from '../ui';
import { CampRow } from './CampsPage';

const STAGES = Object.keys(STAGE_LABEL);
const ACTIVITY = {
  added_school: 'Added', viewed_school: 'Viewed', contacted_coach: 'Contacted coach at', added_camp: 'Added camp for', attended_camp: 'Attended camp at',
  added_note: 'Added a note on', stage_changed: 'Moved',
  prepared_email: 'Prepared an email to', copied_email: 'Copied an email for', opened_email_app: 'Opened your email app for',
};
const TABS = [['schools', 'Schools'], ['pipeline', 'Pipeline'], ['camps', 'Camps'], ['activity', 'Activity']];

function SignedOut() {
  return (
    <div className="max-w-md mx-auto text-center space-y-4 py-10">
      <h1 className="text-3xl font-black">Your recruiting list</h1>
      <p className="text-slate-400">Sign in to save schools, build your pipeline, keep private notes and track coach contact.</p>
      <Link to="/auth?next=/my-list"><Btn size="lg">Create account / sign in</Btn></Link>
    </div>
  );
}

export default function MyListPage() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, error } = useDashboard(isAuthenticated);
  const qc = useQueryClient();
  const [tab, setTab] = useState('schools');
  const move = useRcMutation(({ id, stage }) => rc.patch(`/me/targets/${id}`, { stage }));
  const remove = useRcMutation((id) => rc.del(`/me/targets/${id}`), { onSuccess: () => toast.success('Removed') });
  if (!isAuthenticated) return <SignedOut />;
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { cards, profile } = data;
  const byStage = (s) => cards.filter((c) => c.stage === s);

  const onDragEnd = (r) => {
    if (!r.destination || r.destination.droppableId === r.source.droppableId) return;
    const stage = r.destination.droppableId;
    // Optimistic: move the card now, reconcile when the server answers.
    qc.setQueryData(['rc', 'dashboard'], (d) => d && ({ ...d, cards: d.cards.map((c) => (c.target_id === r.draggableId ? { ...c, stage } : c)) }));
    move.mutate({ id: r.draggableId, stage }, { onError: (e) => toast.error(e.message) });
  };

  const sharePath = profile.share_list && profile.privacy !== 'private' ? `/list/${profile.share_token}` : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">My recruiting dashboard</h1>
          <div className="text-slate-400 text-sm">{cards.length} school{cards.length === 1 ? '' : 's'} on your list{profile.state ? '' : ' · add your state in Profile for distances'}</div>
        </div>
        <div className="flex gap-2">
          {sharePath ? <ShareButton url={sharePath} title="My college soccer list" label="Share list" /> : <Link to="/profile#sharing"><Btn variant="secondary" size="sm">Sharing options</Btn></Link>}
          <Link to="/schools"><Btn size="sm">+ Add schools</Btn></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Saved" value={cards.length} />
        <Stat label="In contact" value={byStage('contacted').length + byStage('coach_responded').length} />
        <Stat label="Upcoming camps" value={data.upcoming_camps.length} />
        <Stat label="Follow-ups" value={data.follow_ups.length} sub={data.follow_ups[0] ? `${data.follow_ups[0].school_name} · ${fmtDate(data.follow_ups[0].follow_up_date)}` : ''} />
      </div>

      <div className="flex gap-1 border-b border-white/10 overflow-x-auto">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-red-500 text-red-400' : 'border-transparent text-slate-400 hover:text-white'}`}>{l}</button>
        ))}
      </div>

      {cards.length === 0 && tab !== 'activity' ? (
        <Empty title="Your list is empty">Find a program and tap “Add to My List”. <Link to="/schools" className="text-red-400 font-semibold">Browse schools →</Link></Empty>
      ) : (
        <>
          {tab === 'schools' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {cards.map((c) => (
                <div key={c.target_id} className="space-y-2">
                  <SchoolCard school={{ ...c.school, distance_miles: c.distance_miles }} target={{ stage: c.stage }}>
                    <Btn variant="ghost" size="sm" onClick={() => { if (window.confirm(`Remove ${c.school.school_name}?`)) remove.mutate(c.target_id); }}>Remove</Btn>
                  </SchoolCard>
                  <div className="flex items-center gap-2 px-1">
                    <Select value={c.stage} onChange={(e) => move.mutate({ id: c.target_id, stage: e.target.value })} className="!py-1.5 !text-sm" aria-label={`Stage for ${c.school.school_name}`}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</Select>
                    {c.next_follow_up && <Chip tone="amber">Follow up {fmtDate(c.next_follow_up)}</Chip>}
                  </div>
                  {c.last_contact && <div className="text-xs text-slate-400 px-1">Last contact {fmtDate(c.last_contact.contacted_at)}{c.last_contact.summary ? ` — ${c.last_contact.summary}` : ''}</div>}
                </div>
              ))}
            </div>
          )}

          {tab === 'pipeline' && (
            <>
              <p className="text-sm text-slate-400">Drag a school between columns (press and hold on a phone), or change its stage from the Schools tab.</p>
              <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 snap-x">
                  {STAGES.map((s) => (
                    <Droppable droppableId={s} key={s}>
                      {(prov, snap) => (
                        <div ref={prov.innerRef} {...prov.droppableProps} className={`snap-start shrink-0 w-64 rounded-2xl border p-2.5 min-h-[160px] ${snap.isDraggingOver ? 'border-red-500/60 bg-red-500/5' : 'border-white/10 bg-[#0a1222]'}`}>
                          <div className="flex items-center justify-between px-1.5 pb-2"><div className="text-xs font-black uppercase tracking-wider text-slate-300">{STAGE_LABEL[s]}</div><span className="text-xs text-slate-500">{byStage(s).length}</span></div>
                          <div className="space-y-2">
                            {byStage(s).map((c, i) => (
                              <Draggable draggableId={c.target_id} index={i} key={c.target_id}>
                                {(p2, sn2) => (
                                  <div ref={p2.innerRef} {...p2.draggableProps} {...p2.dragHandleProps} style={p2.draggableProps.style} className={`rounded-xl border p-3 bg-[#10192d] ${sn2.isDragging ? 'border-red-500 shadow-xl' : 'border-white/10'}`}>
                                    <Link to={`/schools/${c.school.slug}`} className="font-bold text-white text-sm leading-tight block">{c.school.school_name}</Link>
                                    <div className="flex flex-wrap gap-1 mt-1.5"><DivisionChip division={c.school.division} />{c.school.best_ranking && <Chip>#{c.school.best_ranking.rank}</Chip>}</div>
                                    {c.last_contact && <div className="text-[11px] text-slate-400 mt-1.5">Last: {fmtDate(c.last_contact.contacted_at)}</div>}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                          </div>
                          {prov.placeholder}
                        </div>
                      )}
                    </Droppable>
                  ))}
                </div>
              </DragDropContext>
            </>
          )}

          {tab === 'camps' && (
            <Section title="Upcoming camps at your schools">
              {data.upcoming_camps.length ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{data.upcoming_camps.map((c) => <CampRow key={c.id} camp={{ ...c, upcoming: true, program: { slug: c.program_slug, school_name: c.school_name } }} workspace={{ camps: data.my_camps }} signedIn />)}</div>
                : <Empty title="No upcoming camps for your schools yet">Camps are added school by school. Check each school's page or its official camps link.</Empty>}
            </Section>
          )}
        </>
      )}

      {tab === 'activity' && (
        <Section title="Recent activity">
          {data.activity.length ? (
            <ul className={`${C.card} divide-y divide-white/10`}>
              {data.activity.map((a) => (
                <li key={a.id} className="px-4 py-3 text-sm flex items-baseline justify-between gap-3">
                  <span className="text-slate-200">{ACTIVITY[a.type] || a.type} <b className="text-white">{a.school_name}</b>{a.detail ? <span className="text-slate-400"> — {a.detail}</span> : ''}</span>
                  <span className="text-xs text-slate-500 shrink-0">{fmtDate(a.created_date)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty title="No activity yet" />}
        </Section>
      )}
    </div>
  );
}
