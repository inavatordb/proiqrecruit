-- Recruiting outreach: highlights, each athlete's own letter templates, and email-preparation history.
-- Platform default letter templates are NOT stored here: they are constants in code, so they can never be edited per athlete.
-- No video files are stored in the database; highlights hold links only.
CREATE TABLE recruiting_highlights (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruiting_highlights_profile_idx ON recruiting_highlights(profile_id);

CREATE TABLE recruiting_letter_templates (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruiting_letter_templates_profile_idx ON recruiting_letter_templates(profile_id);

CREATE TABLE recruiting_outreach_drafts (
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  program_id text NOT NULL REFERENCES college_programs(id) ON DELETE CASCADE,
  status text,                    -- prepared | email_app_opened | copied (never "sent": the platform cannot observe that)
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recruiting_outreach_drafts_profile_idx ON recruiting_outreach_drafts(profile_id, program_id);
