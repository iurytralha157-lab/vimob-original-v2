
CREATE OR REPLACE FUNCTION update_entry_status_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_amount >= NEW.amount THEN
    NEW.status := 'paid';
    NEW.paid_date := COALESCE(NEW.paid_date, NOW()::date);
  ELSIF NEW.paid_amount > 0 AND NEW.paid_amount < NEW.amount THEN
    NEW.status := 'partial';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
