do $$
begin
  if exists (select 1 from pg_type where typname = 'notification_channel') then
    alter type public.notification_channel add value if not exists 'email';
  end if;
end $$;

alter table public.shops
  add column if not exists reminder_channels text[] not null default array['email']::text[],
  add column if not exists reminder_lead_minutes integer not null default 180;

alter table public.shops
  drop constraint if exists shops_reminder_channels_valid;

alter table public.shops
  add constraint shops_reminder_channels_valid
  check (reminder_channels <@ array['email', 'whatsapp']::text[]);

update public.shops
set reminder_channels = array['email']::text[]
where reminder_channels is null;

create or replace function public.queue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  starts_at timestamptz;
  reminder_channel text;
  reminder_channels text[];
  reminder_lead_minutes integer;
begin
  starts_at := (new.date::text || ' ' || new.start_time::text)::timestamp at time zone 'America/Santo_Domingo';

  select
    coalesce(s.reminder_channels, array['email']::text[]),
    coalesce(s.reminder_lead_minutes, 180)
  into reminder_channels, reminder_lead_minutes
  from public.shops s
  where s.id = new.shop_id;

  if coalesce(array_length(reminder_channels, 1), 0) = 0 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    foreach reminder_channel in array reminder_channels loop
      insert into public.notification_events (booking_id, shop_id, client_id, channel, type, scheduled_for, payload)
      values
        (new.id, new.shop_id, new.client_id, reminder_channel::public.notification_channel, 'booking_confirmed', now(), jsonb_build_object('booking_id', new.id)),
        (new.id, new.shop_id, new.client_id, reminder_channel::public.notification_channel, 'booking_reminder', starts_at - make_interval(mins => reminder_lead_minutes), jsonb_build_object('booking_id', new.id))
      on conflict do nothing;
    end loop;

    return new;
  end if;

  if old.status is distinct from new.status and new.status = 'cancelled' then
    foreach reminder_channel in array reminder_channels loop
      insert into public.notification_events (booking_id, shop_id, client_id, channel, type, scheduled_for, payload)
      values (new.id, new.shop_id, new.client_id, reminder_channel::public.notification_channel, 'booking_cancelled', now(), jsonb_build_object('booking_id', new.id));
    end loop;
  end if;

  if old.date is distinct from new.date
     or old.start_time is distinct from new.start_time
     or old.end_time is distinct from new.end_time then
    foreach reminder_channel in array reminder_channels loop
      insert into public.notification_events (booking_id, shop_id, client_id, channel, type, scheduled_for, payload)
      values (new.id, new.shop_id, new.client_id, reminder_channel::public.notification_channel, 'booking_rescheduled', now(), jsonb_build_object('booking_id', new.id));
    end loop;
  end if;

  return new;
end;
$$;
