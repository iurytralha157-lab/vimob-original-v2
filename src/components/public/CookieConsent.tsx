import { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';

interface CookieConsentProps {
  primaryColor?: string;
}

const COOKIE_KEY = 'vimob_cookie_consent';

export function CookieConsent({ primaryColor = '#C4A052' }: CookieConsentProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_KEY);
    if (!consent) {
      // Small delay so page loads first
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_KEY, 'accepted');
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(COOKIE_KEY, 'declined');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 animate-in slide-in-from-bottom duration-500">
      <div
        className="max-w-4xl mx-auto rounded-xl shadow-2xl border backdrop-blur-sm flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5"
        style={{
          backgroundColor: 'rgba(15, 15, 15, 0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          color: '#fff',
        }}
      >
        <Cookie className="w-8 h-8 shrink-0 opacity-80" style={{ color: primaryColor }} />

        <div className="flex-1 text-sm leading-relaxed opacity-90">
          <p>
            Este site utiliza cookies e tecnologias semelhantes para melhorar sua experiência de navegação, 
            personalizar conteúdo e analisar o tráfego. Ao continuar navegando, você concorda com o uso de cookies.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <button
            onClick={decline}
            className="flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg border border-white/20 hover:bg-white/10 transition-colors"
          >
            Recusar
          </button>
          <button
            onClick={accept}
            className="flex-1 sm:flex-none px-5 py-2 text-sm font-medium rounded-lg transition-colors text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
