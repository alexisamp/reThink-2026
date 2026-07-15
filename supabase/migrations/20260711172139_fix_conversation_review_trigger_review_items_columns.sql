create or replace function public.auto_accept_conversation_interaction_review_item()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  payload jsonb := coalesce(new.proposed_payload, '{}'::jsonb);
  payload_channel text := lower(coalesce(payload ->> 'channel', ''));
  payload_type text := lower(coalesce(payload ->> 'type', ''));
  wa_name_key text := public.review_lookup_text(payload ->> 'wa_name');
  wa_phone text := nullif(payload ->> 'wa_phone', '');
  wa_phone_digits text := public.review_digits(payload ->> 'wa_phone');
  resolved_contact_id uuid;
  resolved_count int := 0;
  interaction_day date := current_date;
  interaction_direction text := 'inbound';
  interaction_notes text;
  extracted_email text;
  inserted_interaction_id uuid;
begin
  if new.source <> 'conversations'
    or new.status <> 'pending'
    or new.contact_id is not null
    or new.proposed_target <> 'interaction'
    or payload_channel <> 'whatsapp'
    or payload_type <> 'whatsapp' then
    return new;
  end if;

  if wa_phone_digits <> '' then
    select contact_id, count(*) over ()
    into resolved_contact_id, resolved_count
    from public.contact_phone_mappings
    where user_id = new.user_id
      and public.review_digits(phone_number) = wa_phone_digits
    limit 1;

    if resolved_contact_id is null then
      select id, count(*) over ()
      into resolved_contact_id, resolved_count
      from public.outreach_logs
      where user_id = new.user_id
        and public.review_digits(phone) = wa_phone_digits
      limit 1;
    end if;
  end if;

  if resolved_contact_id is null
    and length(wa_name_key) >= 6
    and wa_name_key !~ '(unread|message|messages|yesterday|today|pdf|pages|amoor)' then
    select id, count(*) over ()
    into resolved_contact_id, resolved_count
    from public.outreach_logs
    where user_id = new.user_id
      and (
        public.review_lookup_text(name) = wa_name_key
        or public.review_lookup_text(name) like wa_name_key || ' %'
      )
    limit 1;
  end if;

  if resolved_contact_id is null or resolved_count <> 1 then
    return new;
  end if;

  begin
    interaction_day := coalesce((payload ->> 'interaction_date')::date, current_date);
  exception when others then
    interaction_day := current_date;
  end;

  if payload ->> 'direction' in ('inbound', 'outbound') then
    interaction_direction := payload ->> 'direction';
  end if;

  interaction_notes := nullif(payload ->> 'notes', '');
  if interaction_notes is null then
    interaction_notes := coalesce(nullif(new.body, ''), new.title);
  end if;
  extracted_email := lower((regexp_match(interaction_notes, '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', 'i'))[1]);

  insert into public.interactions (
    user_id,
    contact_id,
    type,
    direction,
    notes,
    interaction_date,
    external_id,
    channel
  ) values (
    new.user_id,
    resolved_contact_id,
    'whatsapp',
    interaction_direction,
    interaction_notes,
    interaction_day,
    new.source_external_id,
    'whatsapp'
  )
  on conflict do nothing
  returning id into inserted_interaction_id;

  if inserted_interaction_id is null and new.source_external_id is not null then
    select id into inserted_interaction_id
    from public.interactions
    where user_id = new.user_id
      and contact_id = resolved_contact_id
      and external_id = new.source_external_id
    limit 1;
  end if;

  update public.outreach_logs
  set phone = coalesce(phone, wa_phone),
      email = coalesce(email, extracted_email),
      last_interaction_at = greatest(coalesce(last_interaction_at, interaction_day::timestamptz), interaction_day::timestamptz),
      updated_at = now()
  where id = resolved_contact_id
    and user_id = new.user_id;

  if wa_phone is not null then
    insert into public.contact_phone_mappings (
      user_id,
      contact_id,
      phone_number,
      label,
      last_processed_data_id,
      last_processed_at
    ) values (
      new.user_id,
      resolved_contact_id,
      wa_phone,
      'WhatsApp',
      new.source_external_id,
      now()
    )
    on conflict (user_id, phone_number) do update
    set contact_id = excluded.contact_id,
        last_processed_data_id = excluded.last_processed_data_id,
        last_processed_at = excluded.last_processed_at,
        updated_at = now();
  end if;

  update public.review_items
  set contact_id = resolved_contact_id,
      status = 'accepted',
      reviewed_at = now(),
      updated_at = now()
  where id = new.id
    and status = 'pending';

  return new;
end;
$$;

update public.review_items
set status = status,
    updated_at = now()
where source = 'conversations'
  and status = 'pending'
  and proposed_target = 'interaction'
  and proposed_payload ->> 'channel' = 'whatsapp'
  and proposed_payload ->> 'type' = 'whatsapp';
