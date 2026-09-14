-- 살핌 3D 에셋 Storage
-- GLB와 썸네일은 Postgres가 아니라 비공개 Supabase Storage에 저장한다.
-- asset_catalog.model_url / thumbnail_url에는 public URL이 아닌 object path를 저장한다.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    '3d-assets',
    '3d-assets',
    false,
    52428800,
    array['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']
  ),
  (
    '3d-thumbnails',
    '3d-thumbnails',
    false,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 브라우저는 signed URL을 통해서만 파일을 읽는다.
-- 업로드·수정·삭제는 service_role을 사용하는 서버 작업에서만 수행한다.
create policy asset_storage_read
on storage.objects
for select to authenticated
using (bucket_id in ('3d-assets', '3d-thumbnails'));
