-- Recruit: initial schema.
-- Every table: id (stable text key) + promoted columns for relationships/filters + the full record in `data` (jsonb).

CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  data jsonb NOT NULL,                 -- includes scrypt password_hash + salt; never plaintext
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens(user_id);

-- ---------- GLOBAL recruiting catalog (shared by every player, edited by admins) ----------

CREATE TABLE college_programs (
  id text PRIMARY KEY,
  slug text NOT NULL,
  sport text NOT NULL,
  division text,
  conference text,
  state text,
  verification_status text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport, slug)
);
CREATE INDEX college_programs_filter_idx ON college_programs(sport, division, conference, state);

CREATE TABLE coaches (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  role text,
  verification_status text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coaches_program_idx ON coaches(program_id);

CREATE TABLE program_seasons (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  season integer NOT NULL,
  verification_status text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, season)
);

CREATE TABLE program_rankings (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  season integer NOT NULL,
  organization text,
  ranking_type text,
  rank_value integer,
  verification_status text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX program_rankings_program_idx ON program_rankings(program_id, season);

-- Official university camps ONLY. Third-party events live in id_camp_appearances.
CREATE TABLE camps (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  camp_date text,
  year integer,
  verification_status text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX camps_program_idx ON camps(program_id, year);

CREATE TABLE id_camp_appearances (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  event_date text,
  year integer,
  verification_status text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX id_camp_appearances_program_idx ON id_camp_appearances(program_id, year);

-- Provenance: which source backs which record.
CREATE TABLE data_sources (
  id text PRIMARY KEY,
  program_id text REFERENCES college_programs(id) ON DELETE CASCADE,
  entity_type text,
  entity_id text,
  source_url text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_sources_program_idx ON data_sources(program_id);
CREATE INDEX data_sources_entity_idx ON data_sources(entity_type, entity_id);

CREATE TABLE import_runs (
  id text PRIMARY KEY,
  kind text,
  actor text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- PLAYER-OWNED, PRIVATE data: every row is scoped by profile_id ----------

CREATE TABLE player_profiles (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text,
  share_token text,
  privacy text NOT NULL DEFAULT 'private',
  data jsonb NOT NULL,                 -- contact + guardian details live here and are never served publicly
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX player_profiles_slug_idx ON player_profiles(slug);
CREATE INDEX player_profiles_share_idx ON player_profiles(share_token);

-- A saved school IS the pipeline entry: (player, program, stage). It references the global program.
CREATE TABLE saved_schools (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'interested',
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, program_id)
);
CREATE INDEX saved_schools_profile_idx ON saved_schools(profile_id);

CREATE VIEW recruiting_pipeline AS
  SELECT id, profile_id, program_id, stage, created_at, updated_at FROM saved_schools;

CREATE TABLE recruiting_notes (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruiting_notes_profile_idx ON recruiting_notes(profile_id, program_id);

CREATE TABLE coach_communications (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  contacted_at text,
  follow_up_date text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_communications_profile_idx ON coach_communications(profile_id, program_id);

CREATE TABLE recruiting_activity (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  program_id text REFERENCES college_programs(id) ON DELETE SET NULL,
  type text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruiting_activity_profile_idx ON recruiting_activity(profile_id, created_at DESC);

CREATE TABLE camp_tracking (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  camp_id text,
  status text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX camp_tracking_profile_idx ON camp_tracking(profile_id);
