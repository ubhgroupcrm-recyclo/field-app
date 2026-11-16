-- Run once in Supabase SQL Editor (Run without RLS).
-- Standardised operational location names for every project.
-- This also safely creates Compound Damaged Bay if the earlier location migration was missed.
alter table public.site_locations drop constraint if exists site_locations_location_type_check;
alter table public.site_locations add constraint site_locations_location_type_check check (
  location_type in ('compound_delivery_in','compound_damaged_area','compound_recycling_out','field_storage_in','field_damaged_area','field_storage_out')
);
insert into public.site_locations(project_id,name,location_type,field_number)
select p.id,'Compound - Damaged Bay','compound_damaged_area',null
from public.projects p
where not exists(select 1 from public.site_locations l where l.project_id=p.id and l.location_type='compound_damaged_area');

update public.site_locations
set name='Compound - Delivery Bay'
where location_type='compound_delivery_in';

update public.site_locations set name='Compound - Damaged Bay' where location_type='compound_damaged_area';

update public.site_locations
set name='Compound - Recycling Bay'
where location_type='compound_recycling_out';

update public.site_locations
set name='Field ' || field_number || ' - Delivery Bay'
where location_type='field_storage_in';

update public.site_locations
set name='Field ' || field_number || ' - Damaged Bay'
where location_type='field_damaged_area';

update public.site_locations
set name='Field ' || field_number || ' - Recycling Bay'
where location_type='field_storage_out';
