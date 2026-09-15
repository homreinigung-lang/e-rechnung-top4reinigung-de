-- The application and existing storage policies require this private bucket on a fresh project.
INSERT INTO storage.buckets (id, name, public)
VALUES ('firmen-dateien', 'firmen-dateien', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;
