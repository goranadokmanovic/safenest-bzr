-- -----------------------------------------------------------------------------
-- Status zapisnika: U radu / Zatvoren + zahtev za ponovno otvaranje
-- -----------------------------------------------------------------------------

alter table public.field_visits
  add column if not exists report_lock_status text not null default 'in_progress';

alter table public.field_visits
  add column if not exists report_closed_at timestamptz;

alter table public.field_visits
  add column if not exists report_closed_by uuid references auth.users (id) on delete set null;

alter table public.field_visits
  add column if not exists reopen_requested_at timestamptz;

alter table public.field_visits
  add column if not exists reopen_requested_by uuid references auth.users (id) on delete set null;

alter table public.field_visits
  add column if not exists reopen_justification text;

alter table public.field_visits
  add column if not exists reopen_approved_by uuid references auth.users (id) on delete set null;

alter table public.field_visits
  add column if not exists reopen_approved_at timestamptz;

alter table public.field_visits
  drop constraint if exists field_visits_report_lock_status_check;

alter table public.field_visits
  add constraint field_visits_report_lock_status_check
  check (report_lock_status in ('in_progress', 'closed'));

create index if not exists field_visits_report_lock_status_idx
  on public.field_visits (agency_id, report_lock_status);

create index if not exists field_visits_reopen_requested_idx
  on public.field_visits (agency_id, reopen_requested_at)
  where reopen_requested_at is not null and report_lock_status = 'closed';

comment on column public.field_visits.report_lock_status is
  'Zaključavanje zapisnika: in_progress (editable) | closed (read-only do odobrenja).';
comment on column public.field_visits.report_closed_at is
  'Kada je zapisnik zatvoren.';
comment on column public.field_visits.report_closed_by is
  'Ko je zatvorio zapisnik (auth.users).';
comment on column public.field_visits.reopen_requested_at is
  'Kada je poslat zahtev za ponovno otvaranje.';
comment on column public.field_visits.reopen_justification is
  'Obrazloženje zahteva za ponovno otvaranje.';
comment on column public.field_visits.reopen_approved_at is
  'Kada je agency_owner/super_admin odobrio ponovno otvaranje.';

-- DB-nivo: zabrani izmenu report / report_fields dok je zatvoren.
-- Dozvoli tranziciju closed → in_progress (odobrenje).
create or replace function public.enforce_field_visit_report_lock()
returns trigger
language plpgsql
as $$
begin
  if old.report_lock_status = 'closed'
     and new.report_lock_status = 'in_progress' then
    return new;
  end if;

  if old.report_lock_status = 'closed' then
    if new.report is distinct from old.report
       or new.report_fields is distinct from old.report_fields then
      raise exception 'Zapisnik je zatvoren i ne može se menjati.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists field_visits_enforce_report_lock on public.field_visits;
create trigger field_visits_enforce_report_lock
  before update on public.field_visits
  for each row
  execute procedure public.enforce_field_visit_report_lock();
