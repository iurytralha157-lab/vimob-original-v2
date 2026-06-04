-- Sincronizar dados legados: copiar first_touch_at para first_response_at onde aplicável
UPDATE leads 
SET 
  first_response_at = first_touch_at,
  first_response_channel = 'manual'
WHERE first_touch_at IS NOT NULL 
  AND first_response_at IS NULL;