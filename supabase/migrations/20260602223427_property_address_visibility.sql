alter table public.properties
  add column if not exists public_address_visibility text not null default 'parcial';

alter table public.properties
  drop constraint if exists properties_public_address_visibility_check;

alter table public.properties
  add constraint properties_public_address_visibility_check
  check (public_address_visibility in ('completo', 'parcial', 'minimo'));

comment on column public.properties.public_address_visibility is
  'Controls how much of the property address is shown on the public website: completo, parcial, minimo.';
