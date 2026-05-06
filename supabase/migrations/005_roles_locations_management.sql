-- ============================================================
-- iTatto — Roles, ubicación, gestión avanzada y notificaciones
-- ============================================================

-- Tipos seguros
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_role') then
    create type public.account_role as enum ('client', 'barber', 'shop_owner');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    create type public.notification_channel as enum ('whatsapp');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum (
      'booking_confirmed',
      'booking_reminder',
      'booking_cancelled',
      'booking_rescheduled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');
  end if;
end $$;

-- ============================================================
-- PROFILES — rol + ubicación base del usuario
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.account_role not null,
  first_name text,
  last_name text,
  business_name text,
  email text,
  phone text,
  country_code text not null,
  country_name text not null,
  city text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_user_id_idx on public.profiles(user_id);
create index if not exists profiles_location_idx on public.profiles(country_code, city);
create index if not exists profiles_role_idx on public.profiles(role);

-- ============================================================
-- SHOPS — ubicación, descripción y visibilidad
-- ============================================================

alter table public.shops
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists city text,
  add column if not exists description text,
  add column if not exists is_active boolean not null default true;

create index if not exists shops_location_idx on public.shops(country_code, city);
create index if not exists shops_active_location_idx on public.shops(is_active, country_code, city);

-- ============================================================
-- CLIENTS — ubicación redundante para consultas rápidas
-- ============================================================

alter table public.clients
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists city text;

create index if not exists clients_location_idx on public.clients(country_code, city);

-- ============================================================
-- SERVICES — gestión avanzada
-- ============================================================

alter table public.services
  add column if not exists description text,
  add column if not exists category text,
  add column if not exists is_visible boolean not null default true,
  add column if not exists sort_order integer not null default 0;

create index if not exists services_shop_visibility_idx
  on public.services(shop_id, is_active, is_visible);

create index if not exists services_category_idx
  on public.services(category);

-- ============================================================
-- BARBERS — gestión avanzada
-- ============================================================

alter table public.barbers
  add column if not exists specialty text,
  add column if not exists is_active boolean not null default true;

create index if not exists barbers_shop_active_idx on public.barbers(shop_id, is_active);

-- ============================================================
-- FAVORITOS
-- ============================================================

create table if not exists public.favorite_shops (
  client_id uuid not null references public.clients(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, shop_id)
);

create table if not exists public.favorite_barbers (
  client_id uuid not null references public.clients(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, barber_id)
);

create index if not exists favorite_shops_shop_idx on public.favorite_shops(shop_id);
create index if not exists favorite_barbers_barber_idx on public.favorite_barbers(barber_id);

-- ============================================================
-- HORARIOS Y BLOQUEOS DE BARBEROS
-- ============================================================

create table if not exists public.barber_availability (
  id uuid primary key default uuid_generate_v4(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint barber_availability_valid_time check (start_time < end_time)
);

create table if not exists public.barber_time_blocks (
  id uuid primary key default uuid_generate_v4(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  constraint barber_time_blocks_valid_time check (
    (start_time is null and end_time is null)
    or
    (start_time is not null and end_time is not null and start_time < end_time)
  )
);

create index if not exists barber_availability_barber_weekday_idx
  on public.barber_availability(barber_id, weekday);

create index if not exists barber_time_blocks_barber_date_idx
  on public.barber_time_blocks(barber_id, date);

-- ============================================================
-- NOTIFICACIONES / WHATSAPP
-- ============================================================

create table if not exists public.notification_events (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references public.bookings(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  channel public.notification_channel not null default 'whatsapp',
  type public.notification_type not null,
  status public.notification_status not null default 'pending',
  scheduled_for timestamptz,
  sent_at timestamptz,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_status_schedule_idx
  on public.notification_events(status, scheduled_for);

create index if not exists notification_events_booking_idx
  on public.notification_events(booking_id);

create index if not exists notification_events_shop_idx
  on public.notification_events(shop_id);

-- ============================================================
-- Updated_at helper
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.favorite_shops enable row level security;
alter table public.favorite_barbers enable row level security;
alter table public.barber_availability enable row level security;
alter table public.barber_time_blocks enable row level security;
alter table public.notification_events enable row level security;

-- PROFILES
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- FAVORITE SHOPS
drop policy if exists "favorite_shops_client_read" on public.favorite_shops;
create policy "favorite_shops_client_read" on public.favorite_shops
  for select using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

drop policy if exists "favorite_shops_client_insert" on public.favorite_shops;
create policy "favorite_shops_client_insert" on public.favorite_shops
  for insert with check (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

drop policy if exists "favorite_shops_client_delete" on public.favorite_shops;
create policy "favorite_shops_client_delete" on public.favorite_shops
  for delete using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

-- FAVORITE BARBERS
drop policy if exists "favorite_barbers_client_read" on public.favorite_barbers;
create policy "favorite_barbers_client_read" on public.favorite_barbers
  for select using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

drop policy if exists "favorite_barbers_client_insert" on public.favorite_barbers;
create policy "favorite_barbers_client_insert" on public.favorite_barbers
  for insert with check (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

drop policy if exists "favorite_barbers_client_delete" on public.favorite_barbers;
create policy "favorite_barbers_client_delete" on public.favorite_barbers
  for delete using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

-- BARBER AVAILABILITY
drop policy if exists "barber_availability_public_read" on public.barber_availability;
create policy "barber_availability_public_read" on public.barber_availability
  for select using (is_active = true);

drop policy if exists "barber_availability_manage" on public.barber_availability;
create policy "barber_availability_manage" on public.barber_availability
  for all using (
    barber_id in (
      select b.id
      from public.barbers b
      left join public.shops s on s.id = b.shop_id
      where b.user_id = auth.uid() or s.owner_id = auth.uid()
    )
  )
  with check (
    barber_id in (
      select b.id
      from public.barbers b
      left join public.shops s on s.id = b.shop_id
      where b.user_id = auth.uid() or s.owner_id = auth.uid()
    )
  );

-- BARBER TIME BLOCKS
drop policy if exists "barber_time_blocks_owner_read" on public.barber_time_blocks;
create policy "barber_time_blocks_owner_read" on public.barber_time_blocks
  for select using (
    barber_id in (
      select b.id
      from public.barbers b
      left join public.shops s on s.id = b.shop_id
      where b.user_id = auth.uid() or s.owner_id = auth.uid()
    )
  );

drop policy if exists "barber_time_blocks_manage" on public.barber_time_blocks;
create policy "barber_time_blocks_manage" on public.barber_time_blocks
  for all using (
    barber_id in (
      select b.id
      from public.barbers b
      left join public.shops s on s.id = b.shop_id
      where b.user_id = auth.uid() or s.owner_id = auth.uid()
    )
  )
  with check (
    barber_id in (
      select b.id
      from public.barbers b
      left join public.shops s on s.id = b.shop_id
      where b.user_id = auth.uid() or s.owner_id = auth.uid()
    )
  );

-- NOTIFICATION EVENTS
drop policy if exists "notification_events_shop_owner_read" on public.notification_events;
create policy "notification_events_shop_owner_read" on public.notification_events
  for select using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

drop policy if exists "notification_events_client_read" on public.notification_events;
create policy "notification_events_client_read" on public.notification_events
  for select using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

drop policy if exists "notification_events_shop_owner_insert" on public.notification_events;
create policy "notification_events_shop_owner_insert" on public.notification_events
  for insert with check (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

drop policy if exists "notification_events_shop_owner_update" on public.notification_events;
create policy "notification_events_shop_owner_update" on public.notification_events
  for update using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

-- ============================================================
-- Ajustes a políticas existentes para campos nuevos
-- ============================================================

-- Las policies existentes de shops/services/barbers ya limitan gestión por owner/user.
-- Esta migración solo amplía estructura y añade tablas nuevas.
