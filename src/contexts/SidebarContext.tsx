import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const TABLET_MAX = 1024;

const STORAGE_KEY = 'sidebar-collapsed';

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) return saved === 'true';
      return window.innerWidth < TABLET_MAX;
    }
    return false;
  });

  const setCollapsed = (value: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState(prev => {
      const next = typeof value === 'function' ? value(prev) : value;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  // Collapse automatically when resizing into tablet range
  useEffect(() => {
    const handleResize = () => {
      const isTabletOrSmaller = window.innerWidth < TABLET_MAX;
      setCollapsed(prev => {
        // Only auto-collapse when entering tablet; don't force expand on desktop
        if (isTabletOrSmaller && !prev) return true;
        return prev;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleCollapsed = () => setCollapsed(prev => !prev);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
