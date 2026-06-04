import { useState, useRef } from 'react';
import { trackConversion, trackWhatsAppClick } from '@/hooks/use-site-analytics';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { MessageCircle, Loader2, CheckCircle } from 'lucide-react';

interface ContactFormDialogProps {
  organizationId: string;
  propertyId?: string;
  propertyCode?: string;
  propertyTitle?: string;
  whatsappNumber?: string;
  primaryColor?: string;
  trigger?: React.ReactNode;
}

function getVisitorSessionId() {
  let sessionId = localStorage.getItem('vimob_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('vimob_session_id', sessionId);
  }

  return sessionId;
}

export function ContactFormDialog({
  organizationId,
  propertyId,
  propertyCode,
  propertyTitle,
  whatsappNumber,
  primaryColor = '#F97316',
  trigger,
}: ContactFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    message: propertyCode 
      ? `Olá! Tenho interesse no imóvel ${propertyCode}${propertyTitle ? ` - ${propertyTitle}` : ''}.`
      : '',
  });

  const submittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submissions
    if (submittingRef.current || isSubmitting) return;
    
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast.error('Por favor, preencha nome e telefone');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch(
        'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/public-site-contact',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organization_id: organizationId,
            name: formData.name.trim(),
            phone: formData.phone.trim(),
            email: formData.email.trim() || null,
            message: formData.message.trim() || null,
            property_id: propertyId || null,
            property_code: propertyCode || null,
            session_id: getVisitorSessionId(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar mensagem');
      }

      setIsSuccess(true);
      toast.success('Mensagem enviada com sucesso!');
      
      // Track conversion for analytics
      if (organizationId) {
        trackConversion(organizationId);
      }
      
    } catch (error) {
      console.error('Error submitting contact form:', error);
      toast.error('Erro ao enviar mensagem. Tente novamente.');
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleWhatsAppRedirect = () => {
    if (!whatsappNumber) {
      toast.error('WhatsApp não configurado');
      return;
    }

    const cleanNumber = whatsappNumber.replace(/\D/g, '');
    const message = encodeURIComponent(
      formData.message || 
      (propertyCode 
        ? `Olá! Tenho interesse no imóvel ${propertyCode}.`
        : 'Olá! Gostaria de mais informações.')
    );
    
    trackWhatsAppClick(organizationId, { phone: cleanNumber });
    window.open(`https://wa.me/${cleanNumber}?text=${message}`, '_blank');
    setOpen(false);
  };

  const handleClose = () => {
    setOpen(false);
    // Reset form after animation
    setTimeout(() => {
      setIsSuccess(false);
      setFormData({
        name: '',
        phone: '',
        email: '',
        message: propertyCode 
          ? `Olá! Tenho interesse no imóvel ${propertyCode}${propertyTitle ? ` - ${propertyTitle}` : ''}.`
          : '',
      });
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        {trigger || (
          <Button 
            className="gap-2"
            style={{ backgroundColor: primaryColor }}
          >
            <MessageCircle className="w-4 h-4" />
            Fale Conosco
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[90%] sm:max-w-md sm:w-full rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isSuccess ? 'Mensagem Enviada!' : 'Fale Conosco'}
          </DialogTitle>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center space-y-4">
            <div 
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
              style={{ backgroundColor: `${primaryColor}20` }}
            >
              <CheckCircle className="w-8 h-8" style={{ color: primaryColor }} />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium">Obrigado pelo contato!</p>
              <p className="text-muted-foreground text-sm">
                Recebemos sua mensagem e entraremos em contato em breve.
              </p>
            </div>
            
            {whatsappNumber && (
              <div className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Deseja falar agora pelo WhatsApp?
                </p>
                <Button
                  onClick={handleWhatsAppRedirect}
                  className="gap-2 w-full"
                  style={{ backgroundColor: '#25D366' }}
                >
                  <MessageCircle className="w-4 h-4" />
                  Abrir WhatsApp
                </Button>
              </div>
            )}
            
            <Button variant="outline" onClick={handleClose} className="w-full mt-4">
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Seu nome completo"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                maxLength={20}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Mensagem</Label>
              <Textarea
                id="message"
                placeholder="Escreva sua mensagem..."
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={3}
                maxLength={1000}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 gap-2"
                style={{ backgroundColor: primaryColor }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar Mensagem'
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Ao enviar, você concorda com nossa política de privacidade.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
