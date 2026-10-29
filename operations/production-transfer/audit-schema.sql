begin;
create table if not exists public.fuel_record_audit (
 event_id text primary key, record_id text not null, record_sn bigint,
 operation text not null check(operation in ('create','update','delete')),
 actor_id uuid not null, actor_email text not null,
 confirmed_at timestamptz not null default clock_timestamp(), client_at text,
 device_id text, device_name text, reason text not null,
 before_data jsonb, after_data jsonb
);
alter table public.fuel_record_audit add column if not exists actor_name text;
alter table public.fuel_record_audit add column if not exists event_sequence bigint generated always as identity;
grant usage,select on sequence public.fuel_record_audit_event_sequence_seq to service_role;
create index if not exists fuel_record_audit_record_time on public.fuel_record_audit(record_id,confirmed_at desc,event_id);
alter table public.fuel_record_audit enable row level security;
revoke all on public.fuel_record_audit from public,anon,authenticated;
grant select,insert on public.fuel_record_audit to service_role;
create or replace function public.fuel_commit_audited_snapshot(p_expected timestamptz,p_records jsonb,p_events jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous_time timestamptz; actual_time timestamptz; event jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('fuel_commit_audited_snapshot'));
 select updated_at into previous_time from public.fuel_shared_state where id='shared' for update;
 if previous_time is distinct from p_expected then return null; end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_typeof(p_events)<>'array' then raise exception 'Invalid audited snapshot'; end if;
 actual_time:=clock_timestamp();
 for event in select value from jsonb_array_elements(p_events) loop
  insert into public.fuel_record_audit(event_id,record_id,record_sn,operation,actor_id,actor_email,actor_name,confirmed_at,client_at,device_id,device_name,reason,before_data,after_data)
  values(event->>'event_id',event->>'record_id',(event->>'record_sn')::bigint,event->>'operation',(event->>'actor_id')::uuid,event->>'actor_email',event->>'actor_name',actual_time,event->>'client_at',event->>'device_id',event->>'device_name',event->>'reason',event->'before_data',event->'after_data');
 end loop;
 insert into public.fuel_shared_state(id,records,updated_at) values('shared',p_records,actual_time)
 on conflict(id) do update set records=excluded.records,updated_at=excluded.updated_at;
 return jsonb_build_object('updated_at',actual_time);
end;$$;
revoke all on function public.fuel_commit_audited_snapshot(timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.fuel_commit_audited_snapshot(timestamptz,jsonb,jsonb) to service_role;
commit;
