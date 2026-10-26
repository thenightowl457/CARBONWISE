CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  region TEXT NOT NULL DEFAULT 'IN',
  distance_unit TEXT NOT NULL DEFAULT 'km' CHECK (distance_unit IN ('km','mi')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('commute','energy','consumption')),
  activity_type TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  activity_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities (user_id, activity_date);

CREATE TABLE IF NOT EXISTS emission_factors (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  region TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL CHECK (value >= 0),
  unit_basis TEXT NOT NULL,
  source TEXT NOT NULL,
  notes TEXT,
  version INT NOT NULL DEFAULT 1,
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_type, region, version)
);

CREATE TABLE IF NOT EXISTS recommendation_rules (
  id SERIAL PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  params JSONB NOT NULL,
  action_text TEXT NOT NULL,
  rationale TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenarios (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  inputs JSONB NOT NULL,
  baseline_kg DOUBLE PRECISION NOT NULL,
  projected_kg DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS change_log (
  id SERIAL PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id INT,
  action TEXT NOT NULL,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
