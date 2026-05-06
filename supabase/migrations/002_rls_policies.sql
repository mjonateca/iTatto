-- ============================================================
-- iTatto — Row Level Security (RLS)
-- ============================================================

-- Habilitar RLS en todas las tablas
alter table public.shops            enable row level security;
alter table public.barbers          enable row level security;
alter table public.services         enable row level security;
alter table public.barber_services  enable row level security;
alter table public.clients          enable row level security;
alter table public.bookings         enable row level security;
alter table public.reviews          enable row level security;

-- ============================================================
-- SHOPS
-- ============================================================

-- Lectura pública (página de estudio de tatuajes es pública)
create policy "shops_public_read" on public.shops
  for select using (true);

-- Solo el dueño puede crear/editar/eliminar su shop
create policy "shops_owner_insert" on public.shops
  for insert with check (auth.uid() = owner_id);

create policy "shops_owner_update" on public.shops
  for update using (auth.uid() = owner_id);

create policy "shops_owner_delete" on public.shops
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- BARBERS
-- ============================================================

-- Lectura pública
create policy "barbers_public_read" on public.barbers
  for select using (true);

-- Cada tatuador gestiona su propio perfil
create policy "barbers_self_insert" on public.barbers
  for insert with check (auth.uid() = user_id);

create policy "barbers_self_update" on public.barbers
  for update using (auth.uid() = user_id);

-- El dueño del shop también puede ver los tatuadors de su tienda
create policy "barbers_shop_owner_read" on public.barbers
  for select using (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  );

-- ============================================================
-- SERVICES
-- ============================================================

-- Lectura pública
create policy "services_public_read" on public.services
  for select using (true);

-- Solo el dueño del shop gestiona servicios
create policy "services_owner_insert" on public.services
  for insert with check (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  );

create policy "services_owner_update" on public.services
  for update using (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  );

create policy "services_owner_delete" on public.services
  for delete using (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  );

-- ============================================================
-- BARBER_SERVICES
-- ============================================================

create policy "barber_services_public_read" on public.barber_services
  for select using (true);

create policy "barber_services_self_manage" on public.barber_services
  for all using (
    barber_id in (
      select id from public.barbers where user_id = auth.uid()
    )
  );

-- ============================================================
-- CLIENTS
-- ============================================================

-- Cada cliente ve solo su propio perfil
create policy "clients_self_read" on public.clients
  for select using (auth.uid() = user_id);

create policy "clients_self_insert" on public.clients
  for insert with check (auth.uid() = user_id);

create policy "clients_self_update" on public.clients
  for update using (auth.uid() = user_id);

-- Dueños de shops pueden ver clientes que reservaron en su shop
create policy "clients_shop_owner_read" on public.clients
  for select using (
    id in (
      select client_id from public.bookings
      where shop_id in (
        select id from public.shops where owner_id = auth.uid()
      )
    )
  );

-- ============================================================
-- BOOKINGS
-- ============================================================

-- El cliente ve sus propias reservas
create policy "bookings_client_read" on public.bookings
  for select using (
    client_id in (
      select id from public.clients where user_id = auth.uid()
    )
  );

-- Dueño del shop ve todas las reservas de su shop
create policy "bookings_shop_owner_read" on public.bookings
  for select using (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  );

-- Tatuadors ven sus propias reservas
create policy "bookings_barber_read" on public.bookings
  for select using (
    barber_id in (
      select id from public.barbers where user_id = auth.uid()
    )
  );

-- Clientes pueden crear reservas
create policy "bookings_client_insert" on public.bookings
  for insert with check (
    client_id in (
      select id from public.clients where user_id = auth.uid()
    )
  );

-- Clientes pueden cancelar sus reservas
create policy "bookings_client_cancel" on public.bookings
  for update using (
    client_id in (
      select id from public.clients where user_id = auth.uid()
    )
  )
  with check (status = 'cancelled');

-- Dueños y tatuadors pueden actualizar estado
create policy "bookings_shop_update" on public.bookings
  for update using (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
    or
    barber_id in (
      select id from public.barbers where user_id = auth.uid()
    )
  );

-- ============================================================
-- REVIEWS
-- ============================================================

-- Lectura pública
create policy "reviews_public_read" on public.reviews
  for select using (true);

-- Solo el cliente que tuvo la reserva puede dejar reseña
create policy "reviews_client_insert" on public.reviews
  for insert with check (
    client_id in (
      select id from public.clients where user_id = auth.uid()
    )
    and
    booking_id in (
      select id from public.bookings
      where status = 'completed'
      and client_id in (
        select id from public.clients where user_id = auth.uid()
      )
    )
  );
