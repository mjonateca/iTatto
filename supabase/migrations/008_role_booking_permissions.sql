-- ============================================================
-- iTatto — Permisos por rol para reservas y gestión de tatuadors
-- ============================================================

drop policy if exists "clients_self_insert" on public.clients;
create policy "clients_self_insert" on public.clients
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.profiles
      where user_id = auth.uid()
        and role = 'client'::public.account_role
    )
  );

drop policy if exists "bookings_client_insert" on public.bookings;
create policy "bookings_client_insert" on public.bookings
  for insert with check (
    client_id in (
      select id from public.clients where user_id = auth.uid()
    )
    and exists (
      select 1
      from public.profiles
      where user_id = auth.uid()
        and role = 'client'::public.account_role
    )
  );

drop policy if exists "barbers_shop_owner_update" on public.barbers;
create policy "barbers_shop_owner_update" on public.barbers
  for update using (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  )
  with check (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  );

drop policy if exists "barber_services_shop_owner_manage" on public.barber_services;
create policy "barber_services_shop_owner_manage" on public.barber_services
  for all using (
    barber_id in (
      select b.id
      from public.barbers b
      join public.shops s on s.id = b.shop_id
      where s.owner_id = auth.uid()
    )
  )
  with check (
    barber_id in (
      select b.id
      from public.barbers b
      join public.shops s on s.id = b.shop_id
      where s.owner_id = auth.uid()
    )
    and service_id in (
      select svc.id
      from public.services svc
      join public.shops s on s.id = svc.shop_id
      where s.owner_id = auth.uid()
    )
  );
