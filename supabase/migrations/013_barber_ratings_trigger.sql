-- Trigger so barber_ratings also updates barbers.rating (same as reviews trigger)
create or replace function update_barber_rating_from_ratings()
returns trigger language plpgsql security definer as $$
begin
  update public.barbers
  set rating = (
    select coalesce(avg(r.rating), 0)
    from (
      select rating from public.reviews where barber_id = new.barber_id
      union all
      select rating from public.barber_ratings where barber_id = new.barber_id
    ) r
  )
  where id = new.barber_id;
  return new;
end;
$$;

create trigger trg_update_barber_rating_from_ratings
after insert or update on public.barber_ratings
for each row execute function update_barber_rating_from_ratings();
