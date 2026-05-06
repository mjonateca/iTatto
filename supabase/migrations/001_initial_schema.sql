-- ============================================================
-- iTatto — Migración inicial (Fase 1)
-- Zona horaria: America/Santo_Domingo
-- ============================================================

-- Extensiones
create extension if not exists "uuid-ossp";
create extension if not exists "unaccent";

-- ============================================================
-- SHOPS — Estudios de tatuajes
-- ============================================================
create table public.shops (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  slug             text not null unique,
  logo_url         text,
  address          text,
  lat              numeric(10, 7),
  lng              numeric(10, 7),
  phone            text,
  whatsapp         text,
  opening_hours    jsonb not null default '{
    "lunes":    {"open":"09:00","close":"19:00","closed":false},
    "martes":   {"open":"09:00","close":"19:00","closed":false},
    "miercoles":{"open":"09:00","close":"19:00","closed":false},
    "jueves":   {"open":"09:00","close":"19:00","closed":false},
    "viernes":  {"open":"09:00","close":"19:00","closed":false},
    "sabado":   {"open":"09:00","close":"17:00","closed":false},
    "domingo":  {"open":"09:00","close":"13:00","closed":true}
  }'::jsonb,
  deposit_required boolean not null default false,
  deposit_amount   numeric(10, 2) not null default 0,
  created_at       timestamptz not null default now()
);

create index shops_owner_id_idx on public.shops(owner_id);
create index shops_slug_idx     on public.shops(slug);

-- ============================================================
-- BARBERS — Tatuadors
-- ============================================================
create table public.barbers (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  shop_id        uuid references public.shops(id) on delete set null,
  display_name   text not null,
  avatar_url     text,
  bio            text,
  portfolio_urls text[] not null default '{}',
  rating         numeric(3, 2) not null default 0,
  is_independent boolean not null default false,
  created_at     timestamptz not null default now()
);

create index barbers_shop_id_idx  on public.barbers(shop_id);
create index barbers_user_id_idx  on public.barbers(user_id);

-- ============================================================
-- SERVICES — Servicios de una estudio de tatuajes
-- ============================================================
create table public.services (
  id           uuid primary key default uuid_generate_v4(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  name         text not null,
  duration_min integer not null default 30,
  price        numeric(10, 2) not null,
  currency     text not null default 'DOP',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index services_shop_id_idx on public.services(shop_id);

-- ============================================================
-- BARBER_SERVICES — Relación tatuador ↔ servicio
-- ============================================================
create table public.barber_services (
  barber_id  uuid not null references public.barbers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (barber_id, service_id)
);

-- ============================================================
-- CLIENTS — Perfil de clientes
-- ============================================================
create table public.clients (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  name       text not null,
  phone      text,
  whatsapp   text,
  created_at timestamptz not null default now()
);

create index clients_user_id_idx on public.clients(user_id);

-- ============================================================
-- BOOKINGS — Reservas
-- ============================================================
create type booking_status  as enum ('pending','confirmed','completed','no_show','cancelled');
create type deposit_status  as enum ('none','paid','refunded');

create table public.bookings (
  id                      uuid primary key default uuid_generate_v4(),
  client_id               uuid not null references public.clients(id) on delete cascade,
  barber_id               uuid not null references public.barbers(id) on delete cascade,
  shop_id                 uuid not null references public.shops(id) on delete cascade,
  service_id              uuid not null references public.services(id) on delete cascade,
  date                    date not null,
  start_time              time not null,
  end_time                time not null,
  status                  booking_status not null default 'pending',
  deposit_status          deposit_status not null default 'none',
  deposit_amount          numeric(10, 2) not null default 0,
  whatsapp_reminder_sent  boolean not null default false,
  created_at              timestamptz not null default now(),

  constraint no_overlap exclude using gist (
    barber_id with =,
    daterange(date, date, '[]') with &&,
    timerange(start_time, end_time) with &&
  ) where (status not in ('cancelled', 'no_show'))
);

create index bookings_barber_id_date_idx on public.bookings(barber_id, date);
create index bookings_shop_id_date_idx   on public.bookings(shop_id, date);
create index bookings_client_id_idx      on public.bookings(client_id);

-- ============================================================
-- REVIEWS — Reseñas post-servicio
-- ============================================================
create table public.reviews (
  id         uuid primary key default uuid_generate_v4(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  barber_id  uuid not null references public.barbers(id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);

create index reviews_barber_id_idx on public.reviews(barber_id);

-- ============================================================
-- FUNCIÓN: actualizar rating promedio del tatuador
-- ============================================================
create or replace function update_barber_rating()
returns trigger language plpgsql security definer as $$
begin
  update public.barbers
  set rating = (
    select coalesce(avg(rating), 0)
    from public.reviews
    where barber_id = new.barber_id
  )
  where id = new.barber_id;
  return new;
end;
$$;

create trigger trg_update_barber_rating
after insert or update on public.reviews
for each row execute function update_barber_rating();

-- ============================================================
-- FUNCIÓN: slug único para shop
-- ============================================================
create or replace function generate_unique_slug(base_slug text)
returns text language plpgsql as $$
declare
  slug_candidate text := base_slug;
  counter integer := 1;
begin
  while exists (select 1 from public.shops where slug = slug_candidate) loop
    slug_candidate := base_slug || '-' || counter;
    counter := counter + 1;
  end loop;
  return slug_candidate;
end;
$$;
