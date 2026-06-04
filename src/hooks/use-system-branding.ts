import { useEffect } from 'react';
import { useSystemSettings } from './use-system-settings';

/**
 * Hook to dynamically inject PWA and branding tags into the document head
 * based on system settings from the database.
 */
export function useSystemBranding() {
  const { data: settings } = useSystemSettings();

  useEffect(() => {
    if (!settings) return;

    const pwaIcon = settings.pwa_icon_url;
    const favicon = settings.favicon_url_light || settings.logo_url_light;
    const appName = "Vimob Crm"; // Could also come from settings if available

    // 1. Update Favicon
    if (favicon) {
      let favNode = document.querySelector("link[rel='icon']");
      if (!favNode) {
        favNode = document.createElement('link');
        favNode.setAttribute('rel', 'icon');
        document.head.appendChild(favNode);
      }
      favNode.setAttribute('href', favicon);
    }

    // 2. Update Apple Touch Icons (Critical for iOS PWA Icon)
    if (pwaIcon) {
      // Update existing or create new ones
      const sizes = [null, '152x152', '180x180', '167x167'];
      
      sizes.forEach(size => {
        const selector = size 
          ? `link[rel='apple-touch-icon'][sizes='${size}']`
          : "link[rel='apple-touch-icon']:not([sizes])";
        
        let node = document.querySelector(selector);
        if (!node) {
          node = document.createElement('link');
          node.setAttribute('rel', 'apple-touch-icon');
          if (size) node.setAttribute('sizes', size);
          document.head.appendChild(node);
        }
        // Force refresh by adding a timestamp to avoid cache issues
        const cacheBuster = `?v=${new Date().getTime()}`;
        node.setAttribute('href', `${pwaIcon}${cacheBuster}`);
      });
      
      // Also update standard icon link
      const iconNode = document.querySelector("link[rel='icon'][type='image/png']");
      if (iconNode) {
        iconNode.setAttribute('href', pwaIcon);
      }
    }

    // 3. Update PWA Meta Tags
    const metaTags = {
      'apple-mobile-web-app-title': appName,
      'application-name': appName,
      'og:title': appName,
      'twitter:title': appName
    };

    Object.entries(metaTags).forEach(([name, value]) => {
      const node = document.querySelector(`meta[name='${name}'], meta[property='${name}']`);
      if (node) {
        node.setAttribute('content', value);
      }
    });

  }, [settings]);
}
