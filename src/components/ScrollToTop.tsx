import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    // Scroll imediato
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    
    // Fallback para garantir em mobile
    const timeoutId = setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, [location.key]);

  return null;
}
