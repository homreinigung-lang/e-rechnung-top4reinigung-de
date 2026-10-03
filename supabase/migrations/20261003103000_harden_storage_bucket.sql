-- Harden the private company-files bucket with conservative upload limits.
-- Existing production contents are PDFs, JPEG/PNG images and XML files, all below 4 MiB.
-- Keep the bucket private and cap future uploads to 20 MiB while allowing the
-- document/image formats currently used by the application.
--
-- The local security replay uses a lightweight bootstrap of storage.buckets that
-- may not include newer Supabase Storage metadata columns. Apply those settings
-- only when the columns exist; hosted Supabase includes them.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) then
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
  else
    update storage.buckets
    set public = false
    where id = 'firmen-dateien';
  end if;
end
$$;
