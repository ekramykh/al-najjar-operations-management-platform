begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fuel-profile-photos','fuel-profile-photos',false,1048576,array['image/jpeg'])
on conflict(id) do nothing;
create policy fuel_profile_photo_read_own on storage.objects for select to authenticated
using(bucket_id='fuel-profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy fuel_profile_photo_insert_own on storage.objects for insert to authenticated
with check(bucket_id='fuel-profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and storage.extension(name)='jpg');
create policy fuel_profile_photo_delete_own on storage.objects for delete to authenticated
using(bucket_id='fuel-profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
