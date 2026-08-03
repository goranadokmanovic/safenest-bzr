-- Tip terenske posete (klasifikacija). Kontrolni broj naloga i dalje vođen
-- isključivo preko parent_visit_id + trigger assign_field_visit_broj_naloga.

alter table public.field_visits
  add column if not exists visit_type text;

update public.field_visits
set visit_type = case
  when parent_visit_id is not null then 'control'
  else 'periodic'
end
where visit_type is null;

alter table public.field_visits
  alter column visit_type set default 'periodic';

alter table public.field_visits
  alter column visit_type set not null;

alter table public.field_visits
  drop constraint if exists field_visits_visit_type_check;

alter table public.field_visits
  add constraint field_visits_visit_type_check
  check (
    visit_type in (
      'initial',
      'periodic',
      'control',
      'extraordinary',
      'advisory'
    )
  );

-- Kontrolna poseta mora imati roditelja; ostali tipovi ne smeju.
alter table public.field_visits
  drop constraint if exists field_visits_visit_type_parent_check;

alter table public.field_visits
  add constraint field_visits_visit_type_parent_check
  check (
    (visit_type = 'control' and parent_visit_id is not null)
    or (visit_type <> 'control' and parent_visit_id is null)
  );

comment on column public.field_visits.visit_type is
  'initial | periodic | control | extraordinary | advisory';
