import { ReactNode } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminMobileSidebar } from './AdminMobileSidebar';
import { AdminHeader } from './AdminHeader';
import { useIsMobile } from '@/hooks/use-mobile';

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

export function AdminLayout({ children, title }: AdminLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
      {/* Desktop sidebar */}
      {!isMobile && (
        <div className="flex-shrink-0">
          <AdminSidebar />
        </div>
      )}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header with hamburger */}
        {isMobile && (
          <div className="h-16 border-b border-border/10 flex items-center px-4 bg-background/80 backdrop-blur-md sticky top-0 z-50">
            <AdminMobileSidebar />
          </div>
        )}
        
        {/* Main header with title and actions */}
        <AdminHeader title={title} />
        
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
