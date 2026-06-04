-- Fase 6: Notificações Automatizadas e UX
-- Este script configura gatilhos para notificar administradores sobre eventos financeiros importantes.

-- 1. Função para Notificar Comissões Pendentes (Liberadas)
CREATE OR REPLACE FUNCTION notify_commission_pending()
RETURNS TRIGGER AS $$
BEGIN
    -- Só dispara se o status mudou para 'pending'
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'pending') OR 
       (TG_OP = 'INSERT' AND NEW.status = 'pending') THEN
        
        -- Insere uma notificação para todos os administradores da organização
        INSERT INTO notifications (organization_id, user_id, type, title, content)
        SELECT 
            NEW.organization_id, 
            ur.user_id, 
            'financial', 
            'Comissão Liberada', 
            'Uma nova comissão está aguardando sua aprovação para pagamento.'
        FROM user_roles ur
        WHERE ur.role = 'admin'; -- Aqui poderíamos filtrar por organização se houver essa relação em user_roles
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger para Comissões
DROP TRIGGER IF EXISTS trg_notify_commission_pending ON commissions;
CREATE TRIGGER trg_notify_commission_pending
AFTER INSERT OR UPDATE ON commissions
FOR EACH ROW EXECUTE FUNCTION notify_commission_pending();

-- 3. Função para Notificar Lançamentos Vencidos
CREATE OR REPLACE FUNCTION notify_financial_overdue()
RETURNS TRIGGER AS $$
BEGIN
    -- Só dispara se o status mudou para 'overdue'
    IF (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'overdue') THEN
        
        INSERT INTO notifications (organization_id, user_id, type, title, content)
        SELECT 
            NEW.organization_id, 
            ur.user_id, 
            'financial', 
            'Lançamento Vencido', 
            'O lançamento "' || NEW.description || '" está com o pagamento atrasado.'
        FROM user_roles ur
        WHERE ur.role = 'admin';
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger para Lançamentos Financeiros
DROP TRIGGER IF EXISTS trg_notify_financial_overdue ON financial_entries;
CREATE TRIGGER trg_notify_financial_overdue
AFTER UPDATE ON financial_entries
FOR EACH ROW EXECUTE FUNCTION notify_financial_overdue();
