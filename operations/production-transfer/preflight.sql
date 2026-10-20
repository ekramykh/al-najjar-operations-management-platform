-- Read-only production checks. Never query password hashes or credential fields.
select u.email,p.can_read,p.can_add,p.can_edit,p.can_delete,p.can_manage_users
from public.app_user_permissions p join auth.users u on u.id=p.user_id order by u.email;
select id,updated_at,jsonb_array_length(records) as entries from public.fuel_shared_state;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public';
select has_table_privilege('authenticated','public.app_user_permissions','UPDATE')
 as browser_can_change_permissions;
