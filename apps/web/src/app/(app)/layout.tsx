import { Sidebar } from '@/components/layout/Sidebar';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { ContextGuard } from '@/components/layout/ContextGuard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ContextGuard>
      <div className="flex h-screen overflow-hidden bg-steel-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <OfflineBanner />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </ContextGuard>
  );
}
