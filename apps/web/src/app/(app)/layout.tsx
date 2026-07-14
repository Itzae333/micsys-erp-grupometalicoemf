import { Sidebar } from '@/components/layout/Sidebar';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { ContextGuard } from '@/components/layout/ContextGuard';
import { ContextKeyedMain } from '@/components/layout/ContextKeyedMain';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ContextGuard>
      <div className="flex h-screen overflow-hidden bg-steel-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <OfflineBanner />
          {/* Spacer for mobile hamburger button */}
          <div className="h-12 flex-shrink-0 md:hidden" />
          <ContextKeyedMain>{children}</ContextKeyedMain>
        </div>
      </div>
    </ContextGuard>
  );
}
