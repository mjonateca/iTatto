-- ============================================================
-- iTatto — Registro de tatuadors y visibilidad de clientes
-- ============================================================

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
  requested_shop_slug text := nullif(regexp_replace(lower(coalesce(metadata->>'shop_slug', '')), '[^a-z0-9-]+', '-', 'g'), '');
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
  elsif profile_role = 'barber' then
    if requested_shop_slug is not null then
      select id into target_shop_id
      from public.shops
      where slug = requested_shop_slug
      limit 1;
    end if;

    insert into public.barbers (
      user_id, shop_id, display_name, bio, specialty, is_independent, is_active
    )
    values (
      new.id,
      target_shop_id,
      trim(coalesce(metadata->>'first_name', '') || ' ' || coalesce(metadata->>'last_name', '')),
      nullif(metadata->>'bio', ''),
      nullif(metadata->>'specialty', ''),
      target_shop_id is null,
      true
    );
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

drop policy if exists "clients_barber_read" on public.clients;
create policy "clients_barber_read" on public.clients
  for select using (
    id in (
      select client_id
      from public.bookings
      where barber_id in (
        select id from public.barbers where user_id = auth.uid()
      )
    )
  );
