/**
 * Entity -> table mapping. This is the ONE place that knows how the app's
 * entity names relate to Postgres tables and which fields are promoted to real
 * (indexed / foreign-key) columns. Everything else lives in the `data` jsonb
 * column, so adding a field to a record never needs a migration.
 *
 * Order matters: parents first. Upserts run in this order, deletes in reverse,
 * so foreign keys are always satisfied.
 *
 * Global / shared (admin-curated):  college_programs and everything that hangs off a program.
 * Player-owned (private):           everything keyed by profile_id.
 * A player's rows POINT AT a college_programs row -- they never copy it.
 */
export const ENTITIES = [
  { entity: 'User', table: 'users', cols: [['email', 'email']] },
  { entity: 'CollegeProgram', table: 'college_programs', cols: [['slug', 'slug'], ['sport', 'sport'], ['division', 'division'], ['conference', 'conference'], ['state', 'state'], ['verification_status', 'verification_status']] },
  { entity: 'RecruitPlayerProfile', table: 'player_profiles', cols: [['user_id', 'owner_user_id'], ['slug', 'slug'], ['share_token', 'share_token'], ['privacy', 'privacy']] },
  { entity: '_AuthToken', table: 'auth_tokens', cols: [['user_id', 'user_id']] },
  { entity: 'ProgramCoach', table: 'coaches', cols: [['program_id', 'program_id'], ['role', 'role'], ['verification_status', 'verification_status']] },
  { entity: 'ProgramSeason', table: 'program_seasons', cols: [['program_id', 'program_id'], ['season', 'season'], ['verification_status', 'verification_status']] },
  { entity: 'ProgramRanking', table: 'program_rankings', cols: [['program_id', 'program_id'], ['season', 'season'], ['organization', 'organization'], ['ranking_type', 'ranking_type'], ['rank_value', 'rank'], ['verification_status', 'verification_status']] },
  { entity: 'ProgramCamp', table: 'camps', cols: [['program_id', 'program_id'], ['camp_date', 'camp_date'], ['year', 'year'], ['verification_status', 'verification_status']] },
  { entity: 'IDCampAppearance', table: 'id_camp_appearances', cols: [['program_id', 'program_id'], ['event_date', 'event_date'], ['year', 'year'], ['verification_status', 'verification_status']] },
  { entity: 'DataSource', table: 'data_sources', cols: [['program_id', 'program_id'], ['entity_type', 'entity_type'], ['entity_id', 'entity_id'], ['source_url', 'source_url']] },
  { entity: 'RecruitTarget', table: 'saved_schools', cols: [['profile_id', 'profile_id'], ['program_id', 'program_id'], ['stage', 'stage']] },
  { entity: 'RecruitNote', table: 'recruiting_notes', cols: [['profile_id', 'profile_id'], ['program_id', 'program_id']] },
  { entity: 'RecruitContact', table: 'coach_communications', cols: [['profile_id', 'profile_id'], ['program_id', 'program_id'], ['contacted_at', 'contacted_at'], ['follow_up_date', 'follow_up_date']] },
  { entity: 'RecruitActivity', table: 'recruiting_activity', cols: [['profile_id', 'profile_id'], ['program_id', 'program_id'], ['type', 'type']] },
  { entity: 'RecruitCampTrack', table: 'camp_tracking', cols: [['profile_id', 'profile_id'], ['program_id', 'program_id'], ['camp_id', 'camp_id'], ['status', 'status']] },
  { entity: 'RecruitImport', table: 'import_runs', cols: [['kind', 'kind'], ['actor', 'actor']] },
];

export const BY_ENTITY = new Map(ENTITIES.map((e) => [e.entity, e]));
export const ENTITY_ORDER = ENTITIES.map((e) => e.entity);
