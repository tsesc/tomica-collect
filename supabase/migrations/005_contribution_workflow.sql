-- Contribution workflow: variant relationships, attribute suggestions, edit history,
-- AI feedback loop, full-text search, and admin role.
-- Implements Pragmatic Mixed strategy (option 3 from design doc).

-- =============================================================================
-- 1. Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 2. tomica_catalog: variant relationships, AI correction hints, FTS column
-- =============================================================================

ALTER TABLE tomica_catalog
  ADD COLUMN IF NOT EXISTS variant_of_id UUID REFERENCES tomica_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_hints JSONB,
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(car_name, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(manufacturer, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(model_number, '')), 'C') ||
      setweight(to_tsvector('simple', coalesce(submission_notes, '')), 'D')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_catalog_variant_of ON tomica_catalog(variant_of_id)
  WHERE variant_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_search_tsv ON tomica_catalog USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_catalog_car_name_trgm ON tomica_catalog USING GIN(car_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_manufacturer_trgm ON tomica_catalog USING GIN(manufacturer gin_trgm_ops)
  WHERE manufacturer IS NOT NULL;

-- Trigger: enforce two-level variant hierarchy (parent -> child only, no chains)
CREATE OR REPLACE FUNCTION enforce_two_level_variant() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.variant_of_id IS NOT NULL THEN
    IF NEW.id = NEW.variant_of_id THEN
      RAISE EXCEPTION 'variant_of_id cannot reference self';
    END IF;
    IF EXISTS (
      SELECT 1 FROM tomica_catalog
      WHERE id = NEW.variant_of_id AND variant_of_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'variant_of_id must point to a top-level entry (variant chains not allowed)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_variant_levels ON tomica_catalog;
CREATE TRIGGER trg_enforce_variant_levels
  BEFORE INSERT OR UPDATE OF variant_of_id ON tomica_catalog
  FOR EACH ROW EXECUTE FUNCTION enforce_two_level_variant();

-- =============================================================================
-- 3. recognition_log: AI feedback loop columns
-- =============================================================================

ALTER TABLE recognition_log
  ADD COLUMN IF NOT EXISTS original_top1_catalog_id UUID REFERENCES tomica_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_chosen_catalog_id UUID REFERENCES tomica_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_recog_correction
  ON recognition_log(original_top1_catalog_id, user_chosen_catalog_id)
  WHERE user_chosen_catalog_id IS NOT NULL
    AND original_top1_catalog_id IS NOT NULL
    AND user_chosen_catalog_id <> original_top1_catalog_id;

-- =============================================================================
-- 4. admins: single source of truth for admin role
-- =============================================================================

CREATE TABLE IF NOT EXISTS admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Bootstrap your first admin manually after this migration runs:
--   INSERT INTO admins (user_id)
--   SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com'
--   ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION is_admin(uid UUID) RETURNS BOOLEAN
  LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = uid);
$$;

-- =============================================================================
-- 5. attribute_suggestions: user-submitted attribute corrections
-- =============================================================================

CREATE TABLE IF NOT EXISTS attribute_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES tomica_catalog(id) ON DELETE CASCADE,
  suggested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  reason TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suggestions_catalog ON attribute_suggestions(catalog_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status_pending ON attribute_suggestions(status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_suggestions_user ON attribute_suggestions(suggested_by);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suggestions_touch ON attribute_suggestions;
CREATE TRIGGER trg_suggestions_touch
  BEFORE UPDATE ON attribute_suggestions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =============================================================================
-- 6. catalog_edit_history: audit trail for all catalog row changes
-- =============================================================================

CREATE TABLE IF NOT EXISTS catalog_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES tomica_catalog(id) ON DELETE CASCADE,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  source TEXT NOT NULL CHECK (source IN (
    'admin_direct', 'suggestion_approved', 'scraper_update', 'cron_correction_hint', 'user_self_edit'
  )),
  suggestion_id UUID REFERENCES attribute_suggestions(id) ON DELETE SET NULL,

  before_jsonb JSONB NOT NULL,
  after_jsonb JSONB NOT NULL,
  changed_fields TEXT[] NOT NULL,

  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edit_history_catalog ON catalog_edit_history(catalog_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_edit_history_user ON catalog_edit_history(edited_by)
  WHERE edited_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_edit_history_suggestion ON catalog_edit_history(suggestion_id)
  WHERE suggestion_id IS NOT NULL;

-- =============================================================================
-- 7. RLS policies
-- =============================================================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_select_authenticated" ON admins;
CREATE POLICY "admins_select_authenticated" ON admins FOR SELECT
  TO authenticated USING (true);

ALTER TABLE attribute_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suggestions_select_authenticated" ON attribute_suggestions;
CREATE POLICY "suggestions_select_authenticated" ON attribute_suggestions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "suggestions_insert_self" ON attribute_suggestions;
CREATE POLICY "suggestions_insert_self" ON attribute_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (suggested_by = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "suggestions_delete_own_pending" ON attribute_suggestions;
CREATE POLICY "suggestions_delete_own_pending" ON attribute_suggestions FOR DELETE
  TO authenticated
  USING (suggested_by = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "suggestions_update_admin" ON attribute_suggestions;
CREATE POLICY "suggestions_update_admin" ON attribute_suggestions FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

ALTER TABLE catalog_edit_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "edit_history_select_authenticated" ON catalog_edit_history;
CREATE POLICY "edit_history_select_authenticated" ON catalog_edit_history FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "catalog_update_admin" ON tomica_catalog;
CREATE POLICY "catalog_update_admin" ON tomica_catalog FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "catalog_delete_admin" ON tomica_catalog;
CREATE POLICY "catalog_delete_admin" ON tomica_catalog FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

-- =============================================================================
-- 8. Helper view: unified admin queue
-- =============================================================================

CREATE OR REPLACE VIEW admin_pending_queue AS
SELECT
  'submission'::text AS kind,
  c.id AS item_id,
  c.id AS catalog_id,
  c.submitted_by AS user_id,
  c.created_at AS created_at,
  jsonb_build_object(
    'car_name', c.car_name,
    'series', c.series,
    'model_number', c.model_number,
    'image_url', c.image_url,
    'submission_notes', c.submission_notes,
    'attributes', c.attributes
  ) AS payload
FROM tomica_catalog c
WHERE c.submission_status = 'user' AND c.verified = false

UNION ALL

SELECT
  'suggestion'::text AS kind,
  s.id AS item_id,
  s.catalog_id,
  s.suggested_by AS user_id,
  s.created_at AS created_at,
  jsonb_build_object(
    'field', s.field,
    'old_value', s.old_value,
    'new_value', s.new_value,
    'reason', s.reason
  ) AS payload
FROM attribute_suggestions s
WHERE s.status = 'pending'

ORDER BY created_at ASC;

GRANT SELECT ON admin_pending_queue TO authenticated;
