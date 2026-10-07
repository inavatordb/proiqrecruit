-- Import pipeline: stable program codes, conference history, richer import_runs.

-- Human-readable stable program id from the research CSVs (e.g. ACC_DUKE_WSOC).
-- The internal id stays the primary key so every foreign key keeps working.
ALTER TABLE college_programs ADD COLUMN program_code text;
CREATE UNIQUE INDEX college_programs_program_code_key ON college_programs(program_code) WHERE program_code IS NOT NULL;

-- A program's conference over time. Today's conference lives on college_programs;
-- history rows are never rewritten when a program moves (e.g. ASUN -> UAC for 2026).
CREATE TABLE program_conference_history (
  id text PRIMARY KEY,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  conference text NOT NULL,
  start_season integer,          -- NULL = membership start unknown
  end_season integer,            -- NULL = still a member
  verification_status text,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX program_conference_history_program_idx ON program_conference_history(program_id, start_season);

ALTER TABLE import_runs ADD COLUMN filename text;
ALTER TABLE import_runs ADD COLUMN status text;
ALTER TABLE import_runs ADD COLUMN started_at timestamptz;
ALTER TABLE import_runs ADD COLUMN completed_at timestamptz;
