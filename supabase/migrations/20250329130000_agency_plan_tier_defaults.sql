-- Plan kodovi: agency_basic | agency_l | agency_xl (umesto starog starter)
alter table public.agencies
  alter column plan_tier set default 'agency_basic';

update public.agencies
set plan_tier = 'agency_basic'
where plan_tier = 'starter';
