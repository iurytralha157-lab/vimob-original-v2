-- Remover versão antiga sem p_deal_status (13 parâmetros)
DROP FUNCTION IF EXISTS public.list_contacts_paginated(
  text, uuid, uuid, uuid, boolean, uuid, text, text, text, text, text, integer, integer
);

-- Remover versão com timestamptz para datas (14 parâmetros com timestamptz)
DROP FUNCTION IF EXISTS public.list_contacts_paginated(
  text, uuid, uuid, uuid, boolean, uuid, text, text, 
  timestamp with time zone, timestamp with time zone, 
  text, text, integer, integer
);