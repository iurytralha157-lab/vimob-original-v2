-- Update the organization name to "Vetter Code" as requested by the user
UPDATE organizations 
SET name = 'Vetter Code' 
WHERE id = 'cd868dbb-924d-4e14-9bc8-5d3e67f44c3d';

-- Also check if there's any other organization with similar name that should be updated
UPDATE organizations 
SET name = 'Vetter Code' 
WHERE name = 'Vetter co.';
