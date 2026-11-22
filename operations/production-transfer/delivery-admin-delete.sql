alter table public.delivery_entities add column deleted_at timestamptz;

create function public.prevent_deleted_delivery_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'This delivery order was deleted.';
  end if;
  return new;
end;
$$;

create trigger prevent_deleted_delivery_update
before update on public.delivery_entities
for each row execute function public.prevent_deleted_delivery_update();

create function public.delivery_delete_order(p_id uuid, p_revision integer, p_actor uuid, p_email text)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  saved public.delivery_entities;
begin
  select * into saved from public.delivery_entities where id = p_id for update;
  if not found or saved.kind <> 'order' or saved.deleted_at is not null then
    raise exception 'Delivery order unavailable.';
  end if;
  if saved.revision is distinct from p_revision then
    raise exception 'Delivery changed on another device. Reload before deleting.';
  end if;

  update public.delivery_entities
  set deleted_at = pg_catalog.clock_timestamp(), revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = saved.id;

  insert into public.delivery_audit(entity_id, actor_id, actor_email, reason, before_data, after_data)
  values (saved.id, p_actor, p_email, 'Deleted delivery order', saved.data, '{}'::jsonb);
end;
$$;

revoke all on function public.delivery_delete_order(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.delivery_delete_order(uuid, integer, uuid, text) to service_role;
