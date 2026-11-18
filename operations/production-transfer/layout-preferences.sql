create table public.app_layout_preferences (
 owner_key text not null,
 layout_key text not null check (layout_key = 'fuel_logs'),
 layout jsonb not null check (jsonb_typeof(layout) = 'object' and layout ?& array['hidden','widths'] and jsonb_typeof(layout->'hidden') = 'array' and jsonb_typeof(layout->'widths') = 'object' and octet_length(layout::text) <= 65536),
 updated_by uuid not null references auth.users(id) default auth.uid(),
 updated_at timestamptz not null default now(),
 primary key (owner_key,layout_key),
 check (owner_key = 'global' or owner_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
alter table public.app_layout_preferences enable row level security;
revoke all on public.app_layout_preferences from anon, authenticated;
grant select, insert, update on public.app_layout_preferences to authenticated;
create policy layout_read on public.app_layout_preferences for select to authenticated
 using ((owner_key = (select auth.uid())::text or owner_key = 'global') and exists(select 1 from public.app_user_permissions p where p.user_id = (select auth.uid()) and p.can_read));
create policy layout_insert on public.app_layout_preferences for insert to authenticated
 with check (updated_by = (select auth.uid()) and exists(select 1 from public.app_user_permissions p where p.user_id = (select auth.uid()) and p.can_read and (owner_key = p.user_id::text or (owner_key = 'global' and p.can_manage_users))));
create policy layout_update on public.app_layout_preferences for update to authenticated
 using (exists(select 1 from public.app_user_permissions p where p.user_id = (select auth.uid()) and p.can_read and (owner_key = p.user_id::text or (owner_key = 'global' and p.can_manage_users))))
 with check (updated_by = (select auth.uid()) and exists(select 1 from public.app_user_permissions p where p.user_id = (select auth.uid()) and p.can_read and (owner_key = p.user_id::text or (owner_key = 'global' and p.can_manage_users))));
comment on table public.app_layout_preferences is 'Layout defaults only. Personal preference takes precedence over the organization fallback. No operational records.';
