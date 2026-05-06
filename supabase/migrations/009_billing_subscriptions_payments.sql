-- ============================================================
-- iTatto — Suscripciones de estudios de tatuajes y pagos online
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('trial', 'active', 'past_due', 'cancelled', 'expired');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'online_payment_mode') then
    create type public.online_payment_mode as enum ('disabled', 'optional', 'required');
  end if;
end $$;

create table if not exists public.platform_billing_settings (
  id integer primary key default 1 check (id = 1),
  trial_days integer not null default 30 check (trial_days >= 0),
  monthly_price numeric(10, 2) not null default 20 check (monthly_price >= 0),
  currency text not null default 'USD',
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_billing_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.shops
  add column if not exists payments_enabled boolean not null default false,
  add column if not exists online_payment_mode public.online_payment_mode not null default 'disabled';

alter table public.bookings
  add column if not exists payment_status public.payment_status not null default 'pending',
  add column if not exists payment_required boolean not null default false,
  add column if not exists payment_amount numeric(10, 2) not null default 0,
  add column if not exists payment_currency text not null default 'DOP',
  add column if not exists paid_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.shop_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null unique references public.shops(id) on delete cascade,
  status public.subscription_status not null default 'trial',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  monthly_price numeric(10, 2) not null default 20,
  currency text not null default 'USD',
  last_payment_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_payment_methods (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  stripe_customer_id text,
  stripe_payment_method_id text not null unique,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_payment_methods (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  stripe_customer_id text,
  stripe_payment_method_id text not null unique,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_payments (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null default 'stripe',
  stripe_customer_id text,
  stripe_payment_intent_id text unique,
  stripe_payment_method_id text,
  amount numeric(10, 2) not null,
  currency text not null default 'DOP',
  status public.payment_status not null default 'pending',
  failure_reason text,
  refunded_amount numeric(10, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_subscriptions_status_idx on public.shop_subscriptions(status);
create index if not exists shop_payment_methods_shop_idx on public.shop_payment_methods(shop_id);
create index if not exists client_payment_methods_client_idx on public.client_payment_methods(client_id);
create index if not exists booking_payments_shop_client_idx on public.booking_payments(shop_id, client_id);
create index if not exists bookings_payment_status_idx on public.bookings(shop_id, payment_status);

drop trigger if exists trg_platform_billing_settings_updated_at on public.platform_billing_settings;
create trigger trg_platform_billing_settings_updated_at
before update on public.platform_billing_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_shop_subscriptions_updated_at on public.shop_subscriptions;
create trigger trg_shop_subscriptions_updated_at
before update on public.shop_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists trg_shop_payment_methods_updated_at on public.shop_payment_methods;
create trigger trg_shop_payment_methods_updated_at
before update on public.shop_payment_methods
for each row execute function public.set_updated_at();

drop trigger if exists trg_client_payment_methods_updated_at on public.client_payment_methods;
create trigger trg_client_payment_methods_updated_at
before update on public.client_payment_methods
for each row execute function public.set_updated_at();

drop trigger if exists trg_booking_payments_updated_at on public.booking_payments;
create trigger trg_booking_payments_updated_at
before update on public.booking_payments
for each row execute function public.set_updated_at();

create or replace function public.create_default_shop_subscription(target_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.platform_billing_settings%rowtype;
begin
  select * into settings_row
  from public.platform_billing_settings
  where id = 1;

  insert into public.shop_subscriptions (
    shop_id,
    status,
    trial_ends_at,
    monthly_price,
    currency,
    metadata
  )
  values (
    target_shop_id,
    'trial',
    now() + make_interval(days => coalesce(settings_row.trial_days, 30)),
    coalesce(settings_row.monthly_price, 20),
    coalesce(settings_row.currency, 'USD'),
    jsonb_build_object('source', 'default')
  )
  on conflict (shop_id) do nothing;
end;
$$;

create or replace function public.handle_shop_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_default_shop_subscription(new.id);
  return new;
end;
$$;

insert into public.shop_subscriptions (
  shop_id,
  status,
  trial_ends_at,
  monthly_price,
  currency,
  metadata
)
select
  s.id,
  'trial',
  now() + make_interval(days => coalesce(pbs.trial_days, 30)),
  coalesce(pbs.monthly_price, 20),
  coalesce(pbs.currency, 'USD'),
  jsonb_build_object('source', 'backfill')
from public.shops s
cross join public.platform_billing_settings pbs
where not exists (
  select 1
  from public.shop_subscriptions ss
  where ss.shop_id = s.id
);

drop trigger if exists trg_handle_shop_created on public.shops;
create trigger trg_handle_shop_created
after insert on public.shops
for each row execute function public.handle_shop_created();

update public.bookings b
set
  payment_amount = coalesce(nullif(b.deposit_amount, 0), svc.price, 0),
  payment_currency = coalesce(svc.currency, 'DOP'),
  payment_required = coalesce(shop.deposit_required, false),
  payment_status = case
    when b.deposit_status = 'paid' then 'paid'::public.payment_status
    when b.deposit_status = 'refunded' then 'refunded'::public.payment_status
    else 'pending'::public.payment_status
  end,
  paid_at = case when b.deposit_status = 'paid' then coalesce(b.paid_at, b.created_at) else b.paid_at end
from public.services svc
join public.shops shop on shop.id = b.shop_id
where svc.id = b.service_id;

create or replace function public.sync_booking_payment_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
  set
    payment_status = new.status,
    paid_at = case when new.status = 'paid' then coalesce(new.paid_at, now()) else paid_at end
  where id = new.booking_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_booking_payment_summary on public.booking_payments;
create trigger trg_sync_booking_payment_summary
after insert or update on public.booking_payments
for each row execute function public.sync_booking_payment_summary();

alter table public.platform_billing_settings enable row level security;
alter table public.shop_subscriptions enable row level security;
alter table public.shop_payment_methods enable row level security;
alter table public.client_payment_methods enable row level security;
alter table public.booking_payments enable row level security;

drop policy if exists "platform_billing_settings_owner_read" on public.platform_billing_settings;
create policy "platform_billing_settings_owner_read" on public.platform_billing_settings
  for select using (true);

drop policy if exists "shop_subscriptions_owner_read" on public.shop_subscriptions;
create policy "shop_subscriptions_owner_read" on public.shop_subscriptions
  for select using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

drop policy if exists "shop_payment_methods_owner_read" on public.shop_payment_methods;
create policy "shop_payment_methods_owner_read" on public.shop_payment_methods
  for select using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

drop policy if exists "client_payment_methods_self_read" on public.client_payment_methods;
create policy "client_payment_methods_self_read" on public.client_payment_methods
  for select using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

drop policy if exists "booking_payments_client_read" on public.booking_payments;
create policy "booking_payments_client_read" on public.booking_payments
  for select using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

drop policy if exists "booking_payments_shop_owner_read" on public.booking_payments;
create policy "booking_payments_shop_owner_read" on public.booking_payments
  for select using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

create or replace function public.is_shop_subscription_allowed(target_shop_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.shop_subscriptions ss
    where ss.shop_id = target_shop_id
      and (
        ss.status in ('trial', 'active')
        or (ss.status = 'past_due' and coalesce(ss.current_period_end, now()) >= now())
      )
  );
$$;
