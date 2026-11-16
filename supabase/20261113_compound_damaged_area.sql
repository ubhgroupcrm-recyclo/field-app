-- Run once in Supabase SQL Editor (Run without RLS).
-- Adds the new-panel damaged holding area at the Site Compound.
alter table public.site_locations drop constraint if exists site_locations_location_type_check;
alter table public.site_locations add constraint site_locations_location_type_check check (
  location_type in ('compound_delivery_in','compound_damaged_area','compound_recycling_out','field_storage_in','field_damaged_area','field_storage_out')
);
insert into public.site_locations(project_id,name,location_type,field_number)
select p.id,'Compound Damaged Area','compound_damaged_area',null
from public.projects p
where not exists(select 1 from public.site_locations l where l.project_id=p.id and l.name='Compound Damaged Area');
