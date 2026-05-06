-- ============================================================
-- iTatto — Registro por rol, catálogo por ubicación y panel
-- ============================================================

do $$
begin
  if exists (select 1 from pg_type where typname = 'booking_status') then
    alter type public.booking_status add value if not exists 'rescheduled';
  end if;
end $$;

create table if not exists public.countries (
  code text primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cities (
  id uuid primary key default uuid_generate_v4(),
  country_code text not null references public.countries(code) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(trim(name))) stored,
  lat numeric(10, 7),
  lng numeric(10, 7),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (country_code, normalized_name)
);

create index if not exists cities_country_active_idx on public.cities(country_code, is_active, name);

insert into public.countries (code, name)
values
  ('DO', 'República Dominicana'),
  ('US', 'Estados Unidos'),
  ('PR', 'Puerto Rico')
on conflict (code) do update set name = excluded.name, is_active = true;

insert into public.cities (country_code, name)
values
  ('DO', 'Santo Domingo'),
  ('DO', 'Santiago'),
  ('DO', 'La Romana'),
  ('DO', 'San Pedro de Macorís'),
  ('DO', 'Punta Cana'),
  ('DO', 'Puerto Plata'),
  ('DO', 'San Francisco de Macorís'),
  ('DO', 'La Vega'),
  ('DO', 'Higüey'),
  ('DO', 'Baní'),
  ('US', 'New York'),
  ('US', 'Miami'),
  ('US', 'Orlando'),
  ('US', 'Boston'),
  ('US', 'Providence'),
  ('PR', 'San Juan'),
  ('PR', 'Bayamón'),
  ('PR', 'Carolina'),
  ('PR', 'Ponce'),
  ('PR', 'Mayagüez')
on conflict (country_code, normalized_name) do update set name = excluded.name, is_active = true;

alter table public.shops
  add column if not exists city_normalized text generated always as (lower(trim(coalesce(city, '')))) stored;

alter table public.clients
  add column if not exists city_normalized text generated always as (lower(trim(coalesce(city, '')))) stored;

alter table public.profiles
  add column if not exists city_normalized text generated always as (lower(trim(coalesce(city, '')))) stored;

create index if not exists shops_location_public_idx
  on public.shops(country_code, city_normalized, is_active);

create index if not exists clients_location_normalized_idx
  on public.clients(country_code, city_normalized);

create table if not exists public.notification_templates (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid references public.shops(id) on delete cascade,
  type public.notification_type not null,
  channel public.notification_channel not null default 'whatsapp',
  is_active boolean not null default true,
  send_offset_minutes integer,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, type, channel)
);

alter table public.notification_templates enable row level security;

drop policy if exists "notification_templates_shop_owner_read" on public.notification_templates;
create policy "notification_templates_shop_owner_read" on public.notification_templates
  for select using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

drop policy if exists "notification_templates_shop_owner_manage" on public.notification_templates;
create policy "notification_templates_shop_owner_manage" on public.notification_templates
  for all using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  )
  with check (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

drop trigger if exists trg_notification_templates_updated_at on public.notification_templates;
create trigger trg_notification_templates_updated_at
before update on public.notification_templates
for each row execute function public.set_updated_at();

create or replace function public.create_default_notification_templates(target_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_templates (shop_id, type, send_offset_minutes, body)
  values
    (target_shop_id, 'booking_confirmed', null, 'Hola {{client_name}}, tu cita en {{shop_name}} queda confirmada para {{date}} a las {{time}}.'),
    (target_shop_id, 'booking_reminder', -180, 'Recordatorio: {{client_name}}, tienes cita en {{shop_name}} hoy a las {{time}}.'),
    (target_shop_id, 'booking_cancelled', null, 'Tu cita en {{shop_name}} fue cancelada. Responde este mensaje si necesitas ayuda.'),
    (target_shop_id, 'booking_rescheduled', null, 'Tu cita en {{shop_name}} fue reprogramada para {{date}} a las {{time}}.')
  on conflict (shop_id, type, channel) do nothing;
end;
$$;

create or replace function public.queue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  starts_at timestamptz;
begin
  starts_at := (new.date::text || ' ' || new.start_time::text)::timestamp at time zone 'America/Santo_Domingo';

  if tg_op = 'INSERT' then
    insert into public.notification_events (booking_id, shop_id, client_id, type, scheduled_for, payload)
    values
      (new.id, new.shop_id, new.client_id, 'booking_confirmed', now(), jsonb_build_object('booking_id', new.id)),
      (new.id, new.shop_id, new.client_id, 'booking_reminder', starts_at - interval '3 hours', jsonb_build_object('booking_id', new.id))
    on conflict do nothing;
    return new;
  end if;

  if old.status is distinct from new.status and new.status = 'cancelled' then
    insert into public.notification_events (booking_id, shop_id, client_id, type, scheduled_for, payload)
    values (new.id, new.shop_id, new.client_id, 'booking_cancelled', now(), jsonb_build_object('booking_id', new.id));
  end if;

  if old.date is distinct from new.date
     or old.start_time is distinct from new.start_time
     or old.end_time is distinct from new.end_time then
    insert into public.notification_events (booking_id, shop_id, client_id, type, scheduled_for, payload)
    values (new.id, new.shop_id, new.client_id, 'booking_rescheduled', now(), jsonb_build_object('booking_id', new.id));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_queue_booking_notifications on public.bookings;
create trigger trg_queue_booking_notifications
after insert or update on public.bookings
for each row execute function public.queue_booking_notifications();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  account_type text := coalesce(metadata->>'account_type', 'client');
  profile_role public.account_role := case
    when account_type = 'barbershop' then 'shop_owner'::public.account_role
    when account_type = 'barber' then 'barber'::public.account_role
    else 'client'::public.account_role
  end;
  target_country_code text := upper(coalesce(metadata->>'country_code', 'DO'));
  target_country_name text := coalesce(metadata->>'country_name', 'República Dominicana');
  target_city text := coalesce(metadata->>'city', 'Santo Domingo');
  target_shop_id uuid;
  target_slug text;
begin
  insert into public.profiles (
    user_id, role, first_name, last_name, business_name, email, phone,
    country_code, country_name, city
  )
  values (
    new.id,
    profile_role,
    nullif(metadata->>'first_name', ''),
    nullif(metadata->>'last_name', ''),
    nullif(metadata->>'business_name', ''),
    new.email,
    nullif(metadata->>'phone', ''),
    target_country_code,
    target_country_name,
    target_city
  )
  on conflict (user_id) do update set
    role = excluded.role,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    business_name = excluded.business_name,
    email = excluded.email,
    phone = excluded.phone,
    country_code = excluded.country_code,
    country_name = excluded.country_name,
    city = excluded.city;

  if profile_role = 'client' then
    insert into public.clients (
      user_id, name, first_name, last_name, phone, whatsapp,
      country_code, country_name, city
    )
    values (
      new.id,
      trim(coalesce(metadata->>'first_name', '') || ' ' || coalesce(metadata->>'last_name', '')),
      nullif(metadata->>'first_name', ''),
      nullif(metadata->>'last_name', ''),
      nullif(metadata->>'phone', ''),
      nullif(metadata->>'phone', ''),
      target_country_code,
      target_country_name,
      target_city
    )
    on conflict (user_id) do update set
      name = excluded.name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone = excluded.phone,
      whatsapp = excluded.whatsapp,
      country_code = excluded.country_code,
      country_name = excluded.country_name,
      city = excluded.city;
  elsif profile_role = 'shop_owner' then
    target_slug := public.generate_unique_slug(
      regexp_replace(lower(unaccent(coalesce(metadata->>'business_name', 'barberia'))), '[^a-z0-9]+', '-', 'g')
    );

    insert into public.shops (
      owner_id, name, slug, address, phone, whatsapp, country_code,
      country_name, city, description, is_active
    )
    values (
      new.id,
      coalesce(nullif(metadata->>'business_name', ''), 'Estudio de tatuajes'),
      target_slug,
      nullif(metadata->>'address', ''),
      nullif(metadata->>'phone', ''),
      nullif(metadata->>'phone', ''),
      target_country_code,
      target_country_name,
      target_city,
      nullif(metadata->>'description', ''),
      true
    )
    returning id into target_shop_id;

    perform public.create_default_notification_templates(target_shop_id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.countries enable row level security;
alter table public.cities enable row level security;

drop policy if exists "countries_public_read" on public.countries;
create policy "countries_public_read" on public.countries
  for select using (is_active = true);

drop policy if exists "cities_public_read" on public.cities;
create policy "cities_public_read" on public.cities
  for select using (is_active = true);
