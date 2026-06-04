
ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0;

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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_entry_status ON financial_entries;
CREATE TRIGGER trg_update_entry_status
BEFORE UPDATE ON financial_entries
FOR EACH ROW
EXECUTE FUNCTION update_entry_status_on_payment();
