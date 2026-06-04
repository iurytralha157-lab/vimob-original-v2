import { useContext, createContext } from 'react';
import { PublicSiteConfig } from '@/hooks/use-public-site';

export interface PublicContextType {
  organizationId: string | null;
  siteConfig: PublicSiteConfig | null;
  isLoading: boolean;
  error: string | null;
}

// This context will be provided by either PreviewSiteWrapper (preview mode)
// or PublicSiteContext (production domain mode)
export const PublicContext = createContext<PublicContextType | undefined>(undefined);

export function usePublicContext(): PublicContextType {
  const context = useContext(PublicContext);
  if (context === undefined) {
    // Return a default loading state if context is not provided
    // This prevents crashes during initial render
    return {
      organizationId: null,
      siteConfig: null,
      isLoading: true,
      error: null,
    };
  }
  return context;
}
