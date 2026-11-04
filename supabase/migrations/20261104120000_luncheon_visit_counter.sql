-- Ellenial Lunch – daily visit counter (4 Nov 2026).
-- For Ellen's own statistics: how many phones opened lunch.ellenial.app each day.
--   * One row per Stockholm day: just a date and a number. No ids, IPs or cookies.
--     The phone remembers that it was already counted today; the server only gets "+1".
--   * The count starts from 0 at midnight by itself (a new day = a new row), and earlier
--     days stay as the statistics. No nightly job that could fail and lose a day.
--   * Nobody can read, set, add or delete rows with the public key. The only thing it can
--     do is call public.lunch_count_visit(), which takes no input, so there is nothing to fake.
--   * A ceiling of 50,000 a day keeps a scripted flood from doing anything but hit the cap.
-- Attack-tested on Postgres 18 before shipping (25/25, see the brief, 4 Nov 2026).

create table luncheon.daily_visits (
  day    date primary key,
  visits integer not null default 0 check (visits >= 0 and visits <= 50000)
);
alter table luncheon.daily_visits enable row level security;
revoke all on luncheon.daily_visits from public, anon, authenticated;

create or replace function public.lunch_count_visit()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into luncheon.daily_visits as d (day, visits)
  values (luncheon.today(), 1)
  on conflict (day) do update
    set visits = least(d.visits + 1, 50000);
$$;

revoke all on function public.lunch_count_visit() from public;
grant execute on function public.lunch_count_visit() to anon, authenticated;
