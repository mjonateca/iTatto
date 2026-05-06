-- Migration 010: Add currency and maps_url columns to shops
-- currency: ISO 4217 code derived from country at registration (e.g. USD, EUR, DOP)
-- maps_url: Google Maps iframe src URL provided by the shop owner

alter table public.shops
  add column if not exists currency   text not null default 'USD',
  add column if not exists maps_url text;

-- Backfill existing shops: derive currency from country_code where possible
update public.shops set currency = case country_code
  when 'DO' then 'DOP'
  when 'US' then 'USD'
  when 'PR' then 'USD'
  when 'MX' then 'MXN'
  when 'CO' then 'COP'
  when 'AR' then 'ARS'
  when 'CL' then 'CLP'
  when 'PE' then 'PEN'
  when 'VE' then 'VES'
  when 'EC' then 'USD'
  when 'BO' then 'BOB'
  when 'PY' then 'PYG'
  when 'UY' then 'UYU'
  when 'CR' then 'CRC'
  when 'PA' then 'USD'
  when 'GT' then 'GTQ'
  when 'HN' then 'HNL'
  when 'SV' then 'USD'
  when 'NI' then 'NIO'
  when 'CU' then 'CUP'
  when 'ES' then 'EUR'
  when 'GB' then 'GBP'
  when 'FR' then 'EUR'
  when 'DE' then 'EUR'
  when 'IT' then 'EUR'
  when 'PT' then 'EUR'
  when 'CA' then 'CAD'
  when 'AU' then 'AUD'
  else 'USD'
end
where currency = 'USD' or currency = 'DOP';

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
  target_country_code text := upper(coalesce(metadata->>'country_code', 'US'));
  target_country_name text := coalesce(metadata->>'country_name', 'Estados Unidos');
  target_city text := coalesce(metadata->>'city', 'New York');
  target_currency text := upper(coalesce(nullif(metadata->>'currency', ''), 'USD'));
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
      country_name, city, description, is_active, currency
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
      true,
      target_currency
    )
    returning id into target_shop_id;

    perform public.create_default_notification_templates(target_shop_id);
  end if;

  return new;
end;
$$;
