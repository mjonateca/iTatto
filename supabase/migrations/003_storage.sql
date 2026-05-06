-- ============================================================
-- iTatto — Storage buckets para imágenes
-- ============================================================

-- Bucket para logos de estudios de tatuajes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shop-logos',
  'shop-logos',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
) on conflict (id) do nothing;

-- Bucket para avatares de tatuadors
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'barber-avatars',
  'barber-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
) on conflict (id) do nothing;

-- Bucket para portfolio
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio',
  'portfolio',
  true,
  10485760, -- 10MB
  array['image/jpeg', 'image/png', 'image/webp']
) on conflict (id) do nothing;

-- RLS Storage: logos
create policy "shop_logos_public_read" on storage.objects
  for select using (bucket_id = 'shop-logos');

create policy "shop_logos_owner_upload" on storage.objects
  for insert with check (
    bucket_id = 'shop-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "shop_logos_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'shop-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS Storage: avatares
create policy "barber_avatars_public_read" on storage.objects
  for select using (bucket_id = 'barber-avatars');

create policy "barber_avatars_owner_upload" on storage.objects
  for insert with check (
    bucket_id = 'barber-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS Storage: portfolio
create policy "portfolio_public_read" on storage.objects
  for select using (bucket_id = 'portfolio');

create policy "portfolio_owner_upload" on storage.objects
  for insert with check (
    bucket_id = 'portfolio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "portfolio_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'portfolio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
