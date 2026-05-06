alter table public.bookings
  alter column client_id drop not null;

alter table public.bookings
  add column if not exists client_name text,
  add column if not exists client_phone text,
  add column if not exists notes text;
