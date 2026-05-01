-- User-contributed catalog entries
-- Existing rows stay as 'official', verified=true.
-- New user submissions go in with submission_status='user', verified=false.
-- All entries (including unverified) are publicly readable so AI scan
-- can match against them and other collectors can confirm.

ALTER TABLE tomica_catalog
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS submission_status text DEFAULT 'official'
    CHECK (submission_status IN ('official','user','disputed','rejected')),
  ADD COLUMN IF NOT EXISTS submission_notes text,
  ADD COLUMN IF NOT EXISTS image_hash text;

CREATE INDEX IF NOT EXISTS idx_catalog_submission_status ON tomica_catalog(submission_status);
CREATE INDEX IF NOT EXISTS idx_catalog_submitted_by ON tomica_catalog(submitted_by);
CREATE INDEX IF NOT EXISTS idx_catalog_image_hash ON tomica_catalog(image_hash) WHERE image_hash IS NOT NULL;

-- Public SELECT (anon + authenticated). Drop any prior policies and recreate.
DROP POLICY IF EXISTS "Catalog is readable by authenticated users" ON tomica_catalog;
DROP POLICY IF EXISTS "Catalog is publicly readable" ON tomica_catalog;
DROP POLICY IF EXISTS "Anyone can read catalog" ON tomica_catalog;

CREATE POLICY "Catalog is publicly readable"
  ON tomica_catalog FOR SELECT
  USING (true);

-- INSERT: authenticated users may add user submissions only.
-- They MUST set submitted_by = themselves, submission_status = 'user', verified = false.
DROP POLICY IF EXISTS "Authenticated users can submit catalog entries" ON tomica_catalog;
CREATE POLICY "Authenticated users can submit catalog entries"
  ON tomica_catalog FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND submission_status = 'user'
    AND verified = false
  );

-- UPDATE: users may edit their own unverified submissions.
DROP POLICY IF EXISTS "Users can edit own unverified submissions" ON tomica_catalog;
CREATE POLICY "Users can edit own unverified submissions"
  ON tomica_catalog FOR UPDATE
  TO authenticated
  USING (submitted_by = auth.uid() AND verified = false AND submission_status = 'user')
  WITH CHECK (submitted_by = auth.uid() AND verified = false AND submission_status = 'user');

-- DELETE: users may delete their own unverified submissions.
DROP POLICY IF EXISTS "Users can delete own unverified submissions" ON tomica_catalog;
CREATE POLICY "Users can delete own unverified submissions"
  ON tomica_catalog FOR DELETE
  TO authenticated
  USING (submitted_by = auth.uid() AND verified = false AND submission_status = 'user');

-- Storage bucket for user-uploaded catalog images (5MB limit, images only).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-catalog-images',
  'user-catalog-images',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies — users can only manage files under their own UID prefix.
DROP POLICY IF EXISTS "User catalog images are publicly readable" ON storage.objects;
CREATE POLICY "User catalog images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-catalog-images');

DROP POLICY IF EXISTS "Authenticated users upload catalog images to own folder" ON storage.objects;
CREATE POLICY "Authenticated users upload catalog images to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-catalog-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own catalog images" ON storage.objects;
CREATE POLICY "Users delete own catalog images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-catalog-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
