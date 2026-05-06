-- Barber ratings table
create table if not exists public.barber_ratings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table public.barber_ratings enable row level security;

create policy "Shop owner reads ratings" on public.barber_ratings
  for select using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

create policy "Clients insert own ratings" on public.barber_ratings
  for insert with check (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

-- Email notifications table
create table if not exists public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  type text not null default 'reminder',
  status text not null default 'pending',
  recipient_email text,
  recipient_name text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.email_notifications enable row level security;

create policy "Shop owner manages email notifications" on public.email_notifications
  for all using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );
