-- Enable pgcrypto for API key encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tomica catalog (read-only for users, seeded by scraper)
CREATE TABLE tomica_catalog (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_number    TEXT NOT NULL,
  car_name        TEXT NOT NULL,
  car_name_en     TEXT,
  series          TEXT NOT NULL DEFAULT 'regular',
  is_first_edition BOOLEAN DEFAULT FALSE,
  manufacturer    TEXT,
  vehicle_type    TEXT,
  body_color      TEXT[] DEFAULT '{}',
  release_date    DATE,
  retired         BOOLEAN DEFAULT FALSE,
  image_url       TEXT,
  source          TEXT DEFAULT 'official',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_catalog_model_number ON tomica_catalog(model_number);
CREATE INDEX idx_catalog_series ON tomica_catalog(series);
CREATE INDEX idx_catalog_manufacturer ON tomica_catalog(manufacturer);

-- User collection
CREATE TABLE user_collection (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_id      UUID NOT NULL REFERENCES tomica_catalog(id),
  photo_url       TEXT,
  condition       TEXT DEFAULT 'good',
  has_box         BOOLEAN DEFAULT FALSE,
  notes           TEXT,
  acquired_date   DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, catalog_id)
);

CREATE INDEX idx_collection_user ON user_collection(user_id);

-- Recognition log
CREATE TABLE recognition_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url       TEXT,
  input_type      TEXT,
  ai_provider     TEXT,
  raw_response    JSONB,
  candidates      JSONB,
  final_match     UUID REFERENCES tomica_catalog(id),
  was_corrected   BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_recognition_user ON recognition_log(user_id);

-- User settings
CREATE TABLE user_settings (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_provider     TEXT DEFAULT 'openai',
  api_keys        JSONB DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE tomica_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catalog is readable by authenticated users"
  ON tomica_catalog FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE user_collection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own collection"
  ON user_collection FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE recognition_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own recognition logs"
  ON recognition_log FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own settings"
  ON user_settings FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-create user_settings on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
