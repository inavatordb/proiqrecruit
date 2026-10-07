import React from 'react';
import { ExtLink } from '../ui';

export const KIND_LABEL = {
  programs: 'Programs', coaches: 'Coaches', seasons: 'Seasons', rankings: 'Rankings', camps: 'Camps', idcamps: 'ID Camp Appearances', sources: 'Sources',
};

const f = (k, label, extra = {}) => ({ k, label, ...extra });
const url = (k, label) => f(k, label, { type: 'url' });
const SRC = [url('source_url', 'Source URL'), f('source_name', 'Source name'), f('notes', 'Notes', { type: 'textarea' })];

export const FIELDS = {
  programs: [
    f('school_name', 'School name'), f('official_school_name', 'Official name'), f('nickname', 'Nickname'),
    f('division', 'Level', { type: 'select', options: ['D1', 'D2', 'D3', 'NAIA', 'JUCO'] }), f('conference', 'Conference'),
    f('city', 'City'), f('state', 'State (abbr or name)'), url('school_website', 'School website'), url('athletics_website', 'Athletics website'),
    url('team_website', "Women's soccer website"), url('schedule_url', 'Schedule URL'), url('roster_url', 'Roster URL'), url('camps_url', 'Official camps URL'),
    url('admissions_url', 'Admissions URL'), f('public_private', 'Public / private', { type: 'select', options: ['Public', 'Private'] }), f('school_type', 'School type'),
    f('enrollment', 'Enrollment', { type: 'number' }), f('gpa_expectation', 'Typical GPA'), f('acceptance_rate', 'Acceptance rate %', { type: 'number' }),
    f('academic_programs', 'Majors / programs', { hint: 'Separate with ;' }), f('academic_info', 'Academic information', { type: 'textarea' }),
    f('description', 'Program description', { type: 'textarea' }), url('logo_url', 'Logo URL'), f('active', 'Active', { type: 'check' }), ...SRC,
  ],
  coaches: [
    f('first_name', 'First name'), f('last_name', 'Last name'), f('title', 'Title', { hint: 'Head Coach, Assistant Coach, Recruiting Coordinator…' }),
    f('email', 'Public email', { type: 'email', hint: 'Institutional address only. Leave blank if not publicly listed.' }), f('phone', 'Phone'),
    url('bio_url', 'Coaching bio URL'), url('profile_url', 'Profile URL'), f('years_at_program', 'Years at program', { type: 'number' }),
    f('previous_schools', 'Previous schools', { hint: 'Separate with ;' }), f('active', 'Active', { type: 'check' }), ...SRC,
  ],
  seasons: [
    f('season', 'Season (year)', { type: 'number' }), f('wins', 'Wins', { type: 'number' }), f('losses', 'Losses', { type: 'number' }), f('ties', 'Ties', { type: 'number' }),
    f('conference_record', 'Conference record', { hint: 'e.g. 7-1-1' }), f('conference_finish', 'Conference finish'), f('regular_season_finish', 'Regular-season finish'),
    f('conference_tournament_result', 'Conference tournament result'), f('conference_champion', 'Conference champion', { type: 'tri' }),
    f('ncaa_tournament_appearance', 'NCAA tournament', { type: 'tri' }), f('ncaa_tournament_round', 'NCAA round reached', { hint: 'First Round, Second Round, Round of 16, Quarterfinal, Semifinal, Runner-up, Champion' }),
    f('postseason_result', 'Other postseason result'), f('goals_for', 'Goals for', { type: 'number' }), f('goals_against', 'Goals against', { type: 'number' }), ...SRC,
  ],
  rankings: [
    f('season', 'Season (year)', { type: 'number' }), f('organization', 'Organization', { type: 'select', options: ['United Soccer Coaches', 'NCAA', 'RPI', 'Massey', 'Other'] }),
    f('ranking_type', 'Type', { type: 'select', options: ['preseason', 'weekly', 'final', 'highest'] }), f('rank', 'Rank', { type: 'number' }),
    f('ranking_date', 'Ranking date', { type: 'date' }), f('week', 'Week'), ...SRC,
  ],
  camps: [
    f('camp_name', 'Camp name'), f('camp_type', 'Type', { type: 'select', options: ['ID Camp', 'Elite ID Camp', 'Residential Camp', 'College ID Camp', 'Prospect Camp', 'Youth Camp', 'Goalkeeper Camp', 'Team Camp', 'Summer Camp', 'Other'] }),
    f('camp_date', 'Start date', { type: 'date' }), f('end_date', 'End date', { type: 'date' }), f('registration_deadline', 'Registration deadline', { type: 'date' }),
    f('location', 'Location'), f('age_range', 'Age range'), f('graduation_years', 'Graduation years', { hint: 'Separate with ;' }), f('gender', 'Gender'), f('cost', 'Cost'),
    url('registration_url', 'Registration URL'), url('official_camp_url', 'Official camp page URL'), f('contact_email', 'Contact email', { type: 'email' }), f('contact_phone', 'Contact phone'),
    f('description', 'Description', { type: 'textarea' }), ...SRC,
  ],
  idcamps: [
    f('event_name', 'Event name'), f('event_organization', 'Organizer', { hint: 'Exact Soccer, Girls College Showcase, ECNL…' }), f('event_date', 'Date', { type: 'date' }),
    f('location', 'Location'), f('event_type', 'Event type'), url('registration_url', 'Registration URL'), f('advertised_school', 'Advertised school'), f('advertised_coach', 'Advertised coach'), ...SRC,
  ],
};

const link = (u, t) => (u ? <ExtLink href={u}>{t || 'link'}</ExtLink> : '—');
const prog = (r) => r.program_name || '—';

export const COLUMNS = {
  programs: [
    { h: 'School', cell: (r) => <span className="font-semibold text-white">{r.school_name}</span> },
    { h: 'Level', cell: (r) => r.division }, { h: 'Conference', cell: (r) => r.conference || '—' }, { h: 'State', cell: (r) => r.state || '—' },
    { h: 'Source', cell: (r) => link(r.source_url, 'source') },
  ],
  coaches: [
    { h: 'Program', cell: prog }, { h: 'Coach', cell: (r) => <span className="font-semibold text-white">{r.first_name} {r.last_name}</span> },
    { h: 'Title', cell: (r) => r.title || '—' }, { h: 'Email', cell: (r) => r.email || <span className="text-slate-500">not listed</span> }, { h: 'Source', cell: (r) => link(r.source_url, 'source') },
  ],
  seasons: [
    { h: 'Program', cell: prog }, { h: 'Season', cell: (r) => r.season },
    { h: 'Record', cell: (r) => (r.wins == null ? '—' : `${r.wins}-${r.losses ?? 0}-${r.ties ?? 0}`) }, { h: 'NCAA', cell: (r) => (r.ncaa_tournament_appearance ? r.ncaa_tournament_round || 'Yes' : '—') },
    { h: 'Source', cell: (r) => link(r.source_url, 'source') },
  ],
  rankings: [
    { h: 'Program', cell: prog }, { h: 'Season', cell: (r) => r.season }, { h: 'Org', cell: (r) => r.organization }, { h: 'Type', cell: (r) => r.ranking_type },
    { h: 'Rank', cell: (r) => `#${r.rank}` }, { h: 'Source', cell: (r) => link(r.source_url, 'source') },
  ],
  camps: [
    { h: 'Program', cell: prog }, { h: 'Camp', cell: (r) => <span className="font-semibold text-white">{r.camp_name}</span> }, { h: 'Date', cell: (r) => r.camp_date },
    { h: 'Type', cell: (r) => r.camp_type }, { h: 'Source', cell: (r) => link(r.source_url, 'source') },
  ],
  idcamps: [
    { h: 'Program', cell: prog }, { h: 'Event', cell: (r) => <span className="font-semibold text-white">{r.event_name}</span> }, { h: 'Date', cell: (r) => r.event_date },
    { h: 'Organizer', cell: (r) => r.event_organization || '—' }, { h: 'Source', cell: (r) => link(r.source_url, 'source') },
  ],
  sources: [
    { h: 'Program', cell: prog }, { h: 'Source', cell: (r) => link(r.source_url, r.source_name || r.source_url?.replace(/^https?:\/\//, '').slice(0, 40)) },
    { h: 'Type', cell: (r) => r.source_type || '—' }, { h: 'Record', cell: (r) => r.entity_type }, { h: 'Extracted', cell: (r) => r.information_extracted || '—' },
    { h: 'Accessed', cell: (r) => (r.accessed_at || '').slice(0, 10) },
  ],
};
