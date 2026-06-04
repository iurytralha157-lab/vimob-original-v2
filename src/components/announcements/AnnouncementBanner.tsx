import { useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useActiveAnnouncement } from '@/hooks/use-announcements';

export function AnnouncementBanner() {
  const { data: announcement, isLoading } = useActiveAnnouncement();
  const [dismissed, setDismissed] = useState(false);

  // Check localStorage for dismissed state
  useEffect(() => {
    if (announcement?.id) {
      const dismissedId = localStorage.getItem('dismissed_announcement');
      if (dismissedId === announcement.id) {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
    }
  }, [announcement?.id]);

  const handleDismiss = () => {
    if (announcement) {
      localStorage.setItem('dismissed_announcement', announcement.id);
    }
    setDismissed(true);
  };

  if (isLoading || !announcement || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-orange-500 text-white py-2.5 px-4 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-4">
        <span className="text-sm font-medium text-center flex-1">
          {announcement.message}
        </span>
        
        {announcement.button_text && announcement.button_url && (
          <a 
            href={announcement.button_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-white text-orange-600 px-3 py-1 rounded text-sm font-medium hover:bg-orange-50 transition-colors shrink-0"
          >
            {announcement.button_text}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        
        <button 
          onClick={handleDismiss} 
          className="p-1 hover:bg-orange-600 rounded transition-colors shrink-0"
          aria-label="Fechar comunicado"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
