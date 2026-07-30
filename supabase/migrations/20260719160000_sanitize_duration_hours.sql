-- -----------------------------------------------------------------------------
-- Sanitize absurd metadata.duration_hours (npr. 6526 — verovatno sekunde
-- snimka ili pogrešan unos tretirani kao sati).
-- Uklanja ključ duration_hours kad je > 24.
-- -----------------------------------------------------------------------------

update public.field_visits
set metadata = metadata - 'duration_hours'
where metadata ? 'duration_hours'
  and (
    case
      when jsonb_typeof(metadata -> 'duration_hours') = 'number'
        then (metadata ->> 'duration_hours')::double precision
      when jsonb_typeof(metadata -> 'duration_hours') = 'string'
        and (metadata ->> 'duration_hours') ~ '^[0-9]+([.][0-9]+)?$'
        then (metadata ->> 'duration_hours')::double precision
      else null
    end
  ) > 24;
