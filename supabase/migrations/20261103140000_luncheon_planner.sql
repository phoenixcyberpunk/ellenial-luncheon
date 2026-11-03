-- Ellenial Lunch – Lunch planner (step 2: the scrambled store).
-- Lives in Gillefeeling's Supabase project in its own `luncheon` schema, with no link to
-- Gillefeeling's or Split's tables. Same pattern as Split:
--   * A lunch's secret lives only in the link after '#'. The phone derives from it (HKDF)
--     an AES-GCM key that never leaves the phone, and an access token; the server keeps
--     only the token's SHA-256.
--   * Each phone writes one answer: a random id + one encrypted blob (first name, hearts,
--     "not joining", pick). The server sees ids, blobs and times, nothing else.
--   * A lunch belongs to one day (Stockholm). From midnight it can't be opened, and the
--     hourly clean-up deletes it with its answers.
-- Nothing here is reachable except through the public.lunch_* functions below.

create schema if not exists luncheon;
revoke all on schema luncheon from public, anon, authenticated;

create table luncheon.lunches (
  id         uuid primary key,
  token_hash bytea not null check (length(token_hash) = 32),
  day        date not null,
  created_at timestamptz not null default now()
);
create index on luncheon.lunches (day);

create table luncheon.answers (
  lunch_id   uuid not null references luncheon.lunches(id) on delete cascade,
  id         uuid not null,
  data_enc   text not null check (length(data_enc) between 10 and 3000),
  revision   int  not null default 1,
  updated_at timestamptz not null default now(),
  primary key (lunch_id, id)
);

create table luncheon.create_attempts (
  ip_hash bytea not null,
  at      timestamptz not null default now()
);
create index on luncheon.create_attempts (at);
create index on luncheon.create_attempts (ip_hash, at);

create table luncheon.settings (
  id   int primary key default 1 check (id = 1),
  salt bytea not null
);
insert into luncheon.settings (salt) values (extensions.gen_random_bytes(32));

alter table luncheon.lunches enable row level security;
alter table luncheon.answers enable row level security;
alter table luncheon.create_attempts enable row level security;
alter table luncheon.settings enable row level security;
revoke all on all tables in schema luncheon from public, anon, authenticated;

-- Today in Stockholm: a lunch belongs to this day only.
create or replace function luncheon.today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Stockholm')::date $$;

-- Checks the link's token. A lunch from an earlier day is treated as ended, even before
-- the clean-up has run.
create or replace function luncheon.open_lunch(p_lunch uuid, p_token text)
returns luncheon.lunches
language plpgsql
security definer
set search_path = ''
as $$
declare
  r luncheon.lunches;
begin
  if p_lunch is null or p_token is null or length(p_token) < 40 or length(p_token) > 64 then
    raise exception 'lunch_not_found' using errcode = 'P0002';
  end if;
  select * into r from luncheon.lunches
   where id = p_lunch and token_hash = sha256(convert_to(p_token, 'UTF8'))
   for update;
  if not found then
    raise exception 'lunch_not_found' using errcode = 'P0002';
  end if;
  if r.day < luncheon.today() then
    raise exception 'lunch_ended' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

-- Tells everyone on the lunch's channel that something changed (empty message; phones refetch).
create or replace function luncheon.ping(p_lunch uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'lunch:' || p_lunch::text, false);
exception when others then
  null;
end;
$$;

-- Starts a lunch. Rate limited per network (hashed with a secret salt, never stored plainly).
create or replace function public.lunch_create(p_lunch uuid, p_token text)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip      text;
  v_ip_hash bytea;
  v_salt    bytea;
  v_day     date := luncheon.today();
begin
  if p_lunch is null or p_token is null or length(p_token) < 40 or length(p_token) > 64 then
    raise exception 'bad_request';
  end if;

  begin
    v_ip := current_setting('request.headers', true)::json ->> 'cf-connecting-ip';
  exception when others then
    v_ip := null;
  end;
  select salt into v_salt from luncheon.settings where id = 1;
  v_ip_hash := sha256(v_salt || convert_to(coalesce(v_ip, 'unknown'), 'UTF8'));
  if (select count(*) from luncheon.create_attempts
       where ip_hash = v_ip_hash and at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from luncheon.create_attempts where at > now() - interval '1 hour') >= 600 then
    raise exception 'rate_limited';
  end if;
  insert into luncheon.create_attempts (ip_hash) values (v_ip_hash);

  insert into luncheon.lunches (id, token_hash, day)
  values (p_lunch, sha256(convert_to(p_token, 'UTF8')), v_day);
  return v_day;
end;
$$;

-- Reads a lunch: its day and every answer (still encrypted).
create or replace function public.lunch_get(p_lunch uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r luncheon.lunches;
begin
  r := luncheon.open_lunch(p_lunch, p_token);
  return jsonb_build_object(
    'day', r.day,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'data_enc', a.data_enc, 'revision', a.revision, 'updated_at', a.updated_at)
             order by a.updated_at, a.id)
        from luncheon.answers a where a.lunch_id = p_lunch), '[]'::jsonb)
  );
end;
$$;

-- Saves this phone's answer. New answer: p_expected_revision null. Update: the revision you
-- last read (stops two tabs overwriting each other). At most 30 answers per lunch.
create or replace function public.lunch_put_answer(
  p_lunch uuid, p_token text, p_id uuid, p_data_enc text, p_expected_revision int default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r     luncheon.lunches;
  v_rev int;
begin
  r := luncheon.open_lunch(p_lunch, p_token);
  if p_id is null or p_data_enc is null or length(p_data_enc) < 10 or length(p_data_enc) > 3000 then
    raise exception 'bad_request';
  end if;

  if p_expected_revision is null then
    if (select count(*) from luncheon.answers where lunch_id = p_lunch) >= 30 then
      raise exception 'lunch_full';
    end if;
    insert into luncheon.answers (lunch_id, id, data_enc) values (p_lunch, p_id, p_data_enc)
    on conflict (lunch_id, id) do nothing;
    if not found then
      raise exception 'edit_conflict';
    end if;
    v_rev := 1;
  else
    update luncheon.answers
       set data_enc = p_data_enc, revision = revision + 1, updated_at = now()
     where lunch_id = p_lunch and id = p_id and revision = p_expected_revision
    returning revision into v_rev;
    if not found then
      raise exception 'edit_conflict';
    end if;
  end if;

  perform luncheon.ping(p_lunch);
  return v_rev;
end;
$$;

-- Deletes everything from earlier days (Stockholm), and old rate-limit rows.
create or replace function luncheon.cleanup()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from luncheon.lunches where day < luncheon.today();
  delete from luncheon.create_attempts where at < now() - interval '1 day';
$$;

revoke all on all functions in schema luncheon from public, anon, authenticated;
revoke all on function
  public.lunch_create(uuid, text),
  public.lunch_get(uuid, text),
  public.lunch_put_answer(uuid, text, uuid, text, int)
  from public;
grant execute on function
  public.lunch_create(uuid, text),
  public.lunch_get(uuid, text),
  public.lunch_put_answer(uuid, text, uuid, text, int)
  to anon, authenticated;

-- Every hour at :05 (pg_cron runs in UTC; checking the Stockholm date each hour means
-- yesterday's lunches are gone by 00:05 in both winter and summer time).
select cron.schedule('luncheon-cleanup', '5 * * * *', 'select luncheon.cleanup()');
