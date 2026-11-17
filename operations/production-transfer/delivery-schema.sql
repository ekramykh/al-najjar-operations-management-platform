-- REVIEW CANDIDATE ONLY. Not applied to any hosted database.
-- First creation only: existing objects intentionally cause an error.
-- Apply separately from layout-preferences.sql after deployment approval.
begin;
create table public.delivery_entities (
 id uuid primary key,
 kind text not null check (kind in ('order','trip')),
 number bigint generated always as identity unique,
 revision integer not null default 1,
 data jsonb not null check (jsonb_typeof(data) = 'object'),
 updated_at timestamptz not null default now()
);
create table public.delivery_audit (
 sequence bigint generated always as identity primary key,
 entity_id uuid not null references public.delivery_entities(id),
 actor_id uuid not null,
 actor_email text not null,
 reason text not null,
 before_data jsonb,
 after_data jsonb not null,
 confirmed_at timestamptz not null default now()
);
create index delivery_audit_entity_idx on public.delivery_audit(entity_id, sequence desc);
alter table public.delivery_entities enable row level security;
alter table public.delivery_audit enable row level security;
revoke all on public.delivery_entities, public.delivery_audit from public, anon, authenticated;
grant all on public.delivery_entities, public.delivery_audit to service_role;
revoke all on sequence public.delivery_entities_number_seq, public.delivery_audit_sequence_seq from public, anon, authenticated;
grant usage, select on sequence public.delivery_entities_number_seq, public.delivery_audit_sequence_seq to service_role;

create function public.delivery_commit(p_id uuid, p_kind text, p_revision integer, p_data jsonb, p_actor uuid, p_email text, p_reason text)
returns jsonb language plpgsql security invoker set search_path = public
as $function$
declare oldrow public.delivery_entities; saved public.delivery_entities;
begin
 select * into oldrow from public.delivery_entities where id=p_id for update;
 if found then
  if oldrow.kind<>p_kind or oldrow.revision<>p_revision then raise exception 'Delivery changed on another device. Reload before saving.'; end if;
  if oldrow.data=p_data then return to_jsonb(oldrow); end if;
  if length(trim(p_reason))=0 then raise exception 'A reason is required.'; end if;
  update public.delivery_entities set data=p_data,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into saved;
 else
  if p_revision<>0 then raise exception 'Delivery no longer available.'; end if;
  insert into public.delivery_entities(id,kind,data) values(p_id,p_kind,p_data) returning * into saved;
 end if;
 insert into public.delivery_audit(entity_id,actor_id,actor_email,reason,before_data,after_data)
 values(p_id,p_actor,p_email,case when oldrow.id is null then 'Initial creation' else p_reason end,oldrow.data,p_data);
 return to_jsonb(saved);
end $function$;
revoke all on function public.delivery_commit(uuid,text,integer,jsonb,uuid,text,text) from public, anon, authenticated;
grant execute on function public.delivery_commit(uuid,text,integer,jsonb,uuid,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('delivery-proof','delivery-proof',false,1048576,array['image/jpeg','image/png','application/pdf']);
-- No user-facing storage policies: access stays behind the authenticated service.
commit;
