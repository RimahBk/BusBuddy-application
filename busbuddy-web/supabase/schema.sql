-- =====================================================================
-- BusBuddy – complete database script for Supabase
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It creates the tables from the ER diagram (Table 3-8), the security
-- rules (RLS), the database functions the pages call, and sample data.
-- It is safe to run on a NEW, empty project.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABLES  (one per entity of the ER diagram)
-- ---------------------------------------------------------------------

-- USER  (the password is stored by Supabase Auth, not in this table)
create table public.users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  email      text not null unique,
  phone_no   text,                                   -- international format, e.g. +96170123456
  type       text not null default 'passenger'
             check (type in ('passenger', 'driver', 'admin'))
);

-- DRIVER  (ISA subtype of USER: adds license_number)
create table public.drivers (
  user_id        uuid primary key references public.users(user_id) on delete cascade,
  license_number text not null unique
);

-- BUS  (a driver owns one bus: 1:1, so owner_id is unique)
create table public.buses (
  bus_id       bigint generated always as identity primary key,
  plate_number text not null unique,
  capacity     int  not null check (capacity > 0),
  owner_id     uuid unique references public.drivers(user_id) on delete set null
);

-- ROUTE
create table public.routes (
  route_id    bigint generated always as identity primary key,
  name        text not null,
  origin      text not null,
  destination text not null,
  path        jsonb            -- optional road shape for the map: [[lat, lng], ...] (e.g. from a GeoJSON file)
);

-- STOP  (belongs to one route)
create table public.stops (
  stop_id            bigint generated always as identity primary key,
  route_id           bigint not null references public.routes(route_id) on delete cascade,
  address            text not null,
  latitude           double precision not null,
  longitude          double precision not null,
  stop_order         int not null,
  minutes_from_start int not null default 0,
  unique (route_id, stop_order)
);

-- TRIP  (uses one bus, assigned to one route, driven by one driver)
-- available_seats is DERIVED, so it is not stored: see available_seats() below.
create table public.trips (
  trip_id        bigint generated always as identity primary key,
  route_id       bigint not null references public.routes(route_id),
  bus_id         bigint not null references public.buses(bus_id),
  driver_id      uuid   not null references public.drivers(user_id),
  departure_time timestamptz not null,
  status         text not null default 'scheduled'
                 check (status in ('scheduled', 'active', 'delayed', 'completed', 'cancelled'))
);

-- BOOKING  (passenger_id is empty for a roadside walk-on recorded by the driver)
create table public.bookings (
  booking_id   bigint generated always as identity primary key,
  passenger_id uuid references public.users(user_id) on delete cascade,
  trip_id      bigint not null references public.trips(trip_id) on delete cascade,
  nb_of_seats  int not null check (nb_of_seats > 0),
  status       text not null default 'booked'
               check (status in ('booked', 'cancelled', 'walk_on')),
  booking_time timestamptz not null default now()
);

-- MESSAGE  (between one passenger and one driver, about one trip)
create table public.messages (
  message_id   bigint generated always as identity primary key,
  trip_id      bigint not null references public.trips(trip_id) on delete cascade,
  passenger_id uuid   not null references public.users(user_id) on delete cascade,
  driver_id    uuid   not null references public.drivers(user_id) on delete cascade,
  content      text   not null check (length(content) between 1 and 500),
  status       text   not null default 'sent' check (status in ('sent', 'read')),
  date_time    timestamptz not null default now(),
  sent_by      text   not null check (sent_by in ('passenger', 'driver'))
);

-- DELAY_REPORT
create table public.delay_reports (
  report_id      bigint generated always as identity primary key,
  trip_id        bigint not null references public.trips(trip_id) on delete cascade,
  reason         text not null,
  delay_time     int  not null check (delay_time > 0),      -- minutes
  status         text not null default 'open' check (status in ('open', 'resolved')),
  time_of_report timestamptz not null default now()
);

-- UPDATED_LOCATION  (one row every ~10 seconds while a trip runs)
create table public.updated_locations (
  location_id bigint generated always as identity primary key,
  trip_id     bigint not null references public.trips(trip_id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  time        timestamptz not null default now(),
  speed       double precision                               -- km/h, may be empty
);

create index on public.updated_locations (trip_id, time desc);
create index on public.bookings (trip_id);
create index on public.messages (trip_id, passenger_id);


-- ---------------------------------------------------------------------
-- 2. HELPERS
-- ---------------------------------------------------------------------

-- Is the logged-in user an administrator?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users
                 where user_id = auth.uid() and type = 'admin');
$$;

-- Derived attribute /available_seats = bus capacity − seats taken
create or replace function public.available_seats(p_trip_id bigint)
returns int language sql stable security definer set search_path = '' as $$
  select b.capacity - coalesce((select sum(k.nb_of_seats) from public.bookings k
                                where k.trip_id = t.trip_id
                                  and k.status in ('booked', 'walk_on')), 0)::int
  from public.trips t join public.buses b on b.bus_id = t.bus_id
  where t.trip_id = p_trip_id;
$$;

-- When someone signs up, create their row in public.users as a PASSENGER.
-- (Drivers and admins are set by the administrator, never by sign-up.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (user_id, full_name, email, phone_no, type)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
          new.email,
          new.raw_user_meta_data ->> 'phone_no',
          'passenger');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY  (who may read or change which rows)
-- ---------------------------------------------------------------------
alter table public.users             enable row level security;
alter table public.drivers           enable row level security;
alter table public.buses             enable row level security;
alter table public.routes            enable row level security;
alter table public.stops             enable row level security;
alter table public.trips             enable row level security;
alter table public.bookings          enable row level security;
alter table public.messages          enable row level security;
alter table public.delay_reports     enable row level security;
alter table public.updated_locations enable row level security;

-- USERS: you read your own row; you may edit your own name and phone; admin reads and edits all
create policy "read own user row"   on public.users for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admin edits users"   on public.users for update to authenticated
  using ((select public.is_admin()));

-- DRIVERS: a driver reads their own row; admin manages all
create policy "read own driver row" on public.drivers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admin manages drivers" on public.drivers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- PUBLIC DATA (no login needed): buses, routes, stops, trips, delays, locations
create policy "anyone reads buses"     on public.buses             for select to anon, authenticated using (true);
create policy "anyone reads routes"    on public.routes            for select to anon, authenticated using (true);
create policy "anyone reads stops"     on public.stops             for select to anon, authenticated using (true);
create policy "anyone reads trips"     on public.trips             for select to anon, authenticated using (true);
create policy "anyone reads delays"    on public.delay_reports     for select to anon, authenticated using (true);
create policy "anyone reads locations" on public.updated_locations for select to anon, authenticated using (true);

-- Only the admin adds, edits or deletes buses, routes, stops and trips
create policy "admin manages buses"  on public.buses  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages routes" on public.routes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages stops"  on public.stops  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin manages trips"  on public.trips  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- BOOKINGS: a passenger reads their own; a driver reads their trips' bookings; admin reads all.
-- Bookings are created and cancelled ONLY through the functions below.
create policy "read bookings" on public.bookings for select to authenticated
  using (passenger_id = (select auth.uid())
         or exists (select 1 from public.trips t
                    where t.trip_id = bookings.trip_id and t.driver_id = (select auth.uid()))
         or (select public.is_admin()));

-- MESSAGES: only the passenger and driver of the conversation (and the admin) read them.
-- Messages are sent ONLY through send_message(), which checks the booking.
create policy "read own messages" on public.messages for select to authenticated
  using (passenger_id = (select auth.uid()) or driver_id = (select auth.uid())
         or (select public.is_admin()));

-- GRANTS: since 2026, Supabase no longer exposes new tables automatically,
-- so each table is granted explicitly. RLS above still decides which rows.
grant select on public.buses, public.routes, public.stops, public.trips,
                public.delay_reports, public.updated_locations to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;


-- ---------------------------------------------------------------------
-- 4. FUNCTIONS THE PAGES CALL  (supabase.rpc('name', {...}))
--    Each one runs as a single transaction, so its checks and its
--    changes can never be split by another user.
-- ---------------------------------------------------------------------

-- 4.1 Live map (public): every running trip with its latest position
create or replace function public.get_live_buses()
returns table (trip_id bigint, route_id bigint, route_name text, plate_number text,
               status text, departure_time timestamptz, latitude double precision,
               longitude double precision, speed double precision, last_update timestamptz,
               delay_minutes int, delay_reason text, available_seats int)
language sql stable security definer set search_path = '' as $$
  select t.trip_id, r.route_id, r.name, b.plate_number, t.status, t.departure_time,
         l.latitude, l.longitude, l.speed, l.time,
         d.delay_time, d.reason, public.available_seats(t.trip_id)
  from public.trips t
  join public.routes r on r.route_id = t.route_id
  join public.buses  b on b.bus_id   = t.bus_id
  left join lateral (select * from public.updated_locations u
                     where u.trip_id = t.trip_id order by u.time desc limit 1) l on true
  left join lateral (select * from public.delay_reports x
                     where x.trip_id = t.trip_id and x.status = 'open'
                     order by x.time_of_report desc limit 1) d on true
  where t.status in ('active', 'delayed');
$$;

-- 4.2 Schedules (public): upcoming trips with free seats
create or replace function public.get_upcoming_trips(p_route_id bigint default null)
returns table (trip_id bigint, route_id bigint, route_name text, origin text,
               destination text, departure_time timestamptz, status text,
               plate_number text, capacity int, available_seats int)
language sql stable security definer set search_path = '' as $$
  select t.trip_id, r.route_id, r.name, r.origin, r.destination, t.departure_time,
         t.status, b.plate_number, b.capacity, public.available_seats(t.trip_id)
  from public.trips t
  join public.routes r on r.route_id = t.route_id
  join public.buses  b on b.bus_id   = t.bus_id
  where t.status in ('scheduled', 'active', 'delayed')
    and t.departure_time > now() - interval '3 hours'
    and (p_route_id is null or t.route_id = p_route_id)
  order by t.departure_time;
$$;

-- 4.3 Reserve a seat (UC-08). Locks the trip so two people can't take the last seat.
create or replace function public.book_seat(p_trip_id bigint, p_seats int default 1)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_trip public.trips; v_id bigint;
begin
  if auth.uid() is null then raise exception 'Please log in to book a seat.'; end if;
  if p_seats < 1 or p_seats > 4 then raise exception 'You can book 1 to 4 seats.'; end if;
  select * into v_trip from public.trips where trip_id = p_trip_id for update;
  if not found then raise exception 'Trip not found.'; end if;
  if v_trip.status <> 'scheduled' or v_trip.departure_time <= now() then
    raise exception 'This trip has already left or is not open for booking.';
  end if;
  if exists (select 1 from public.bookings where trip_id = p_trip_id
             and passenger_id = auth.uid() and status = 'booked') then
    raise exception 'You already have a booking on this trip.';
  end if;
  if public.available_seats(p_trip_id) < p_seats then
    raise exception 'FULL: Not enough free seats on this trip.';
  end if;
  insert into public.bookings (passenger_id, trip_id, nb_of_seats)
  values (auth.uid(), p_trip_id, p_seats) returning booking_id into v_id;
  return v_id;
end;
$$;

-- 4.4 Pick next trip (UC-09): the next departure on the same route with enough seats
create or replace function public.next_available_trip(p_trip_id bigint, p_seats int default 1)
returns table (trip_id bigint, departure_time timestamptz, available_seats int)
language sql stable security definer set search_path = '' as $$
  select t.trip_id, t.departure_time, public.available_seats(t.trip_id)
  from public.trips t
  where t.route_id = (select route_id from public.trips where trip_id = p_trip_id)
    and t.status = 'scheduled'
    and t.departure_time > (select greatest(departure_time, now()) from public.trips where trip_id = p_trip_id)
    and public.available_seats(t.trip_id) >= p_seats
  order by t.departure_time limit 1;
$$;

-- 4.5 My bookings (UC-10), with trip, route and driver details
create or replace function public.get_my_bookings()
returns table (booking_id bigint, trip_id bigint, nb_of_seats int, booking_status text,
               booking_time timestamptz, departure_time timestamptz, trip_status text,
               route_name text, plate_number text, driver_id uuid, driver_name text)
language sql stable security definer set search_path = '' as $$
  select k.booking_id, t.trip_id, k.nb_of_seats, k.status, k.booking_time,
         t.departure_time, t.status, r.name, b.plate_number, t.driver_id, u.full_name
  from public.bookings k
  join public.trips  t on t.trip_id  = k.trip_id
  join public.routes r on r.route_id = t.route_id
  join public.buses  b on b.bus_id   = t.bus_id
  join public.users  u on u.user_id  = t.driver_id
  where k.passenger_id = auth.uid()
  order by t.departure_time desc;
$$;

-- 4.6 Cancel a booking (UC-11): only your own, only before departure
create or replace function public.cancel_booking(p_booking_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_dep timestamptz;
begin
  select t.departure_time into v_dep
  from public.bookings k join public.trips t on t.trip_id = k.trip_id
  where k.booking_id = p_booking_id and k.passenger_id = auth.uid() and k.status = 'booked';
  if not found then raise exception 'Booking not found.'; end if;
  if v_dep <= now() then raise exception 'The bus has already left, so this booking cannot be cancelled.'; end if;
  update public.bookings set status = 'cancelled' where booking_id = p_booking_id;
end;
$$;

-- 4.7 Driver: my trips (UC-13) with seats taken
create or replace function public.get_driver_trips()
returns table (trip_id bigint, route_id bigint, route_name text, plate_number text,
               departure_time timestamptz, status text, seats_taken int, capacity int)
language sql stable security definer set search_path = '' as $$
  select t.trip_id, r.route_id, r.name, b.plate_number, t.departure_time, t.status,
         b.capacity - public.available_seats(t.trip_id), b.capacity
  from public.trips t
  join public.routes r on r.route_id = t.route_id
  join public.buses  b on b.bus_id   = t.bus_id
  where t.driver_id = auth.uid()
    and (t.status in ('scheduled', 'active', 'delayed') or t.departure_time > now() - interval '1 day')
  order by t.departure_time;
$$;

-- 4.8 Driver: passengers booked on one of my trips (names, phones, seats)
create or replace function public.get_trip_passengers(p_trip_id bigint)
returns table (passenger_id uuid, full_name text, phone_no text, nb_of_seats int, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.trips where trip_id = p_trip_id
                 and (driver_id = auth.uid() or public.is_admin())) then
    raise exception 'Not your trip.';
  end if;
  return query
    select k.passenger_id, coalesce(u.full_name, 'Roadside passenger'), u.phone_no, k.nb_of_seats, k.status
    from public.bookings k left join public.users u on u.user_id = k.passenger_id
    where k.trip_id = p_trip_id and k.status in ('booked', 'walk_on')
    order by k.booking_time;
end;
$$;

-- 4.9 Start trip (UC-14)
create or replace function public.start_trip(p_trip_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.trips where driver_id = auth.uid()
             and status in ('active', 'delayed')) then
    raise exception 'You already have a running trip. End it first.';
  end if;
  update public.trips set status = 'active'
  where trip_id = p_trip_id and driver_id = auth.uid() and status = 'scheduled';
  if not found then raise exception 'This trip cannot be started.'; end if;
end;
$$;

-- 4.10 End trip (UC-14) – by its driver, or by the admin from Monitor fleet (UC-19)
create or replace function public.end_trip(p_trip_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.trips set status = 'completed'
  where trip_id = p_trip_id and status in ('active', 'delayed')
    and (driver_id = auth.uid() or public.is_admin());
  if not found then raise exception 'This trip is not running.'; end if;
  update public.delay_reports set status = 'resolved' where trip_id = p_trip_id;
end;
$$;

-- 4.11 Share location (UC-15) – called every 10 seconds by the driver page
create or replace function public.share_location(p_trip_id bigint, p_lat double precision,
                                                 p_lng double precision, p_speed double precision default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.trips where trip_id = p_trip_id
                 and driver_id = auth.uid() and status in ('active', 'delayed')) then
    raise exception 'Trip is not running.';
  end if;
  insert into public.updated_locations (trip_id, latitude, longitude, speed)
  values (p_trip_id, p_lat, p_lng, p_speed);
end;
$$;

-- 4.12 Report delay (UC-16): saves the report; the trip stays running, marked delayed
create or replace function public.report_delay(p_trip_id bigint, p_reason text, p_minutes int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.trips set status = 'delayed'
  where trip_id = p_trip_id and driver_id = auth.uid() and status in ('active', 'delayed');
  if not found then raise exception 'You can only report a delay on a running trip.'; end if;
  update public.delay_reports set status = 'resolved' where trip_id = p_trip_id and status = 'open';
  insert into public.delay_reports (trip_id, reason, delay_time) values (p_trip_id, p_reason, p_minutes);
end;
$$;

-- 4.13 Roadside pickup: the driver records walk-on passengers so the free seats stay correct
create or replace function public.record_walk_on(p_trip_id bigint, p_seats int default 1)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.trips where trip_id = p_trip_id
                 and driver_id = auth.uid() and status in ('active', 'delayed')) then
    raise exception 'Start the trip first.';
  end if;
  if public.available_seats(p_trip_id) < p_seats then raise exception 'The bus is full.'; end if;
  insert into public.bookings (passenger_id, trip_id, nb_of_seats, status)
  values (null, p_trip_id, p_seats, 'walk_on');
end;
$$;

-- 4.14 Send message (UC-02): only between a passenger and the driver of a trip they booked
create or replace function public.send_message(p_trip_id bigint, p_passenger_id uuid, p_content text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_driver uuid; v_sender text;
begin
  select driver_id into v_driver from public.trips
  where trip_id = p_trip_id and status not in ('completed', 'cancelled');
  if not found then raise exception 'This trip has ended.'; end if;
  if auth.uid() = p_passenger_id then v_sender := 'passenger';
  elsif auth.uid() = v_driver then v_sender := 'driver';
  else raise exception 'You are not part of this conversation.'; end if;
  if not exists (select 1 from public.bookings where trip_id = p_trip_id
                 and passenger_id = p_passenger_id and status = 'booked') then
    raise exception 'Messaging needs an active booking on this trip.';
  end if;
  insert into public.messages (trip_id, passenger_id, driver_id, content, sent_by)
  values (p_trip_id, p_passenger_id, v_driver, trim(p_content), v_sender);
end;
$$;

-- 4.15 Mark the other side's messages as read when a conversation is opened
create or replace function public.mark_read(p_trip_id bigint, p_passenger_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.messages set status = 'read'
  where trip_id = p_trip_id and passenger_id = p_passenger_id and status = 'sent'
    and ((auth.uid() = passenger_id and sent_by = 'driver')
      or (auth.uid() = driver_id    and sent_by = 'passenger'));
$$;

-- 4.16 My conversations (list for the Messages page)
create or replace function public.get_conversations()
returns table (trip_id bigint, passenger_id uuid, other_name text, route_name text,
               departure_time timestamptz, last_message text, last_time timestamptz, unread int)
language sql stable security definer set search_path = '' as $$
  with c as (   -- one row per (trip, passenger) where I am the passenger or the driver
    select distinct k.trip_id, k.passenger_id
    from public.bookings k join public.trips t on t.trip_id = k.trip_id
    where k.status = 'booked' and k.passenger_id is not null
      and (k.passenger_id = auth.uid() or t.driver_id = auth.uid())
  )
  select c.trip_id, c.passenger_id,
         case when c.passenger_id = auth.uid() then du.full_name else pu.full_name end,
         r.name, t.departure_time, m.content, m.date_time,
         (select count(*) from public.messages x where x.trip_id = c.trip_id
            and x.passenger_id = c.passenger_id and x.status = 'sent'
            and x.sent_by = case when c.passenger_id = auth.uid() then 'driver' else 'passenger' end)::int
  from c
  join public.trips  t  on t.trip_id  = c.trip_id
  join public.routes r  on r.route_id = t.route_id
  join public.users  du on du.user_id = t.driver_id
  join public.users  pu on pu.user_id = c.passenger_id
  left join lateral (select content, date_time from public.messages x
                     where x.trip_id = c.trip_id and x.passenger_id = c.passenger_id
                     order by x.date_time desc limit 1) m on true
  order by coalesce(m.date_time, t.departure_time) desc;
$$;

-- 4.17 Phone number for a call (UC-03): returned ONLY when a booking links the two people
create or replace function public.get_contact_phone(p_trip_id bigint, p_passenger_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_driver uuid;
begin
  select driver_id into v_driver from public.trips
  where trip_id = p_trip_id and status not in ('completed', 'cancelled');
  if not found then return null; end if;
  if not exists (select 1 from public.bookings where trip_id = p_trip_id
                 and passenger_id = p_passenger_id and status = 'booked') then return null; end if;
  if auth.uid() = p_passenger_id then
    return (select phone_no from public.users where user_id = v_driver);
  elsif auth.uid() = v_driver then
    return (select phone_no from public.users where user_id = p_passenger_id);
  end if;
  return null;
end;
$$;

-- 4.18 Admin: fleet monitor (UC-19)
create or replace function public.admin_fleet()
returns table (trip_id bigint, route_name text, plate_number text, driver_name text,
               driver_phone text, status text, departure_time timestamptz, seats_taken int,
               capacity int, latitude double precision, longitude double precision,
               last_update timestamptz, delay_minutes int, delay_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.'; end if;
  return query
  select t.trip_id, r.name, b.plate_number, u.full_name, u.phone_no, t.status, t.departure_time,
         b.capacity - public.available_seats(t.trip_id), b.capacity,
         l.latitude, l.longitude, l.time, d.delay_time, d.reason
  from public.trips t
  join public.routes r on r.route_id = t.route_id
  join public.buses  b on b.bus_id   = t.bus_id
  join public.users  u on u.user_id  = t.driver_id
  left join lateral (select * from public.updated_locations x where x.trip_id = t.trip_id
                     order by x.time desc limit 1) l on true
  left join lateral (select * from public.delay_reports x where x.trip_id = t.trip_id
                     and x.status = 'open' order by x.time_of_report desc limit 1) d on true
  where t.status in ('active', 'delayed')
  order by t.departure_time;
end;
$$;

-- 4.19 Admin: change a user's role. Making someone a driver needs a licence number.
create or replace function public.admin_set_role(p_user_id uuid, p_type text, p_license text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.'; end if;
  if p_type not in ('passenger', 'driver', 'admin') then raise exception 'Unknown role.'; end if;
  if p_type = 'driver' then
    if coalesce(trim(p_license), '') = '' then raise exception 'A licence number is required for drivers.'; end if;
    insert into public.drivers (user_id, license_number) values (p_user_id, trim(p_license))
    on conflict (user_id) do update set license_number = excluded.license_number;
  elsif exists (select 1 from public.trips where driver_id = p_user_id
                and status in ('scheduled', 'active', 'delayed')) then
    raise exception 'This driver still has trips. Reassign or cancel them first.';
  else
    delete from public.drivers where user_id = p_user_id;
  end if;
  update public.users set type = p_type where user_id = p_user_id;
end;
$$;

-- 4.20 Admin: cancel a trip and all its bookings
create or replace function public.admin_cancel_trip(p_trip_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrators only.'; end if;
  update public.trips set status = 'cancelled' where trip_id = p_trip_id and status = 'scheduled';
  if not found then raise exception 'Only a scheduled trip can be cancelled.'; end if;
  update public.bookings set status = 'cancelled' where trip_id = p_trip_id and status = 'booked';
end;
$$;

-- Who may call which function
revoke execute on all functions in schema public from public;
grant execute on function public.get_live_buses(), public.get_upcoming_trips(bigint),
                          public.next_available_trip(bigint, int), public.available_seats(bigint)
  to anon, authenticated;
grant execute on all functions in schema public to authenticated;


-- ---------------------------------------------------------------------
-- 5. SAMPLE DATA  (one route; stop positions are APPROXIMATE –
--    the admin can correct them on the map in admin.html)
-- ---------------------------------------------------------------------
insert into public.routes (name, origin, destination)
values ('Chouf – LIU Cola', 'Beiteddine', 'LIU Cola');

insert into public.stops (route_id, address, latitude, longitude, stop_order, minutes_from_start) values
  (1, 'Beiteddine',     33.6953, 35.5786, 1,  0),
  (1, 'Deir el Qamar',  33.6967, 35.5617, 2,  8),
  (1, 'Damour',         33.7303, 35.4553, 3, 30),
  (1, 'Khaldeh',        33.7795, 35.4810, 4, 42),
  (1, 'LIU Cola',       33.8770, 35.4930, 5, 60);

-- To make YOURSELF the administrator: register on the website first, then run
--   update public.users set type = 'admin' where email = 'your@email.com';
