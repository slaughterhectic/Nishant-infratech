import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, ClipboardCheck, IndianRupee, KeyRound, PackagePlus, Wallet2 } from 'lucide-react';
import { api } from '../../lib/api';
import { formatRelativeTime } from '../../lib/format';

const EVENT_META: Record<string, { icon: typeof PackagePlus; className: string }> = {
  order_requested: { icon: ClipboardCheck, className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  order_punched: { icon: PackagePlus, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  dispatch_created: { icon: PackagePlus, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  otp_generated: { icon: KeyRound, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  otp_verified: { icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  payment_received: { icon: Wallet2, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  advance_requested: { icon: IndianRupee, className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([api.notifications.list(15), api.notifications.unreadCount()]);
      setItems(list);
      setUnread(count.count);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markAllRead = async () => {
    try { await api.notifications.markRead(); setUnread(0); }
    catch { /* ignore */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-heading/60 transition-colors hover:bg-surface hover:text-heading"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fade-in absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] rounded-xl border border-card-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
            <p className="font-semibold text-heading">Notifications</p>
            {unread > 0 && <button className="text-xs font-medium text-brand-600 hover:underline" onClick={markAllRead}>Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.map((n) => {
              const meta = EVENT_META[n.event_type] ?? { icon: PackagePlus, className: 'bg-gray-100 text-gray-600' };
              const Icon = meta.icon;
              return (
                <div key={n.id} className="flex gap-3 border-b border-card-border px-4 py-3 last:border-0">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.className}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-heading">{n.message}</p>
                    <p className="mt-0.5 text-xs text-heading/40">{formatRelativeTime(n.created_at)}</p>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-heading/40">No notifications yet</p>}
          </div>
        </div>
      )}
    </div>
  );
}
