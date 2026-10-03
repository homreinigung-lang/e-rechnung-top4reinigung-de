-- Harden the private company-files bucket with conservative upload limits.
-- Existing production contents are PDFs, JPEG/PNG images and XML files, all below 4 MiB.
-- Keep the bucket private and cap future uploads to 20 MiB while allowing the
-- document/image formats currently used by the application.

update storage.buckets
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'text/xml',
    'application/xml'
  ]::text[]
where id = 'firmen-dateien';
