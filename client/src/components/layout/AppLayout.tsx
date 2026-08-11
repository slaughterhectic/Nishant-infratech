import { useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuthStore, useMobileNavStore, useSidebarStore } from '../../lib/store';
import { Toast } from '../ui/Toast';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';

const BELL_ROLES = ['owner', 'accountant', 'godown_manager', 'collection_staff'];

export function AppLayout() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const mobileOpen = useMobileNavStore((s) => s.open);
  const setMobileOpen = useMobileNavStore((s) => s.setOpen);
  const user = useAuthStore((s) => s.user);
  const showBell = !!user && BELL_ROLES.includes(user.role);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setMobileOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setMobileOpen]);

  return (
    <div className="min-h-screen bg-surface lg:flex lg:h-screen lg:overflow-hidden">
      <Sidebar />

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="min-h-screen flex-1 lg:h-screen lg:overflow-y-auto">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-card-border bg-card/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-card-border p-2 text-heading transition-colors hover:bg-surface lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-heading lg:hidden">
            Nishant <span className="text-brand-500">Infratech</span>
          </span>
          <div className="ml-auto">{showBell && <NotificationBell />}</div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
      <Toast />
    </div>
  );
}
