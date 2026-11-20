-- Rebrand existing project records from Rayet to SRS.
update public.projects set company='SRS' where company='Rayet';
