import { useEffect, useState } from 'react';
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Fence,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LogOut,
  Moon,
  Notebook,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ShoppingCart,
  Sun,
  Train,
  Truck,
  UserCog,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore, useMobileNavStore, useSidebarStore, useThemeStore } from '../../lib/store';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
  ownerOnly?: boolean;
  driverOnly?: boolean;
  badge?: 'otp';
}

const fullNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, ownerOnly: true },
  { to: '/purchases', label: 'Purchases', icon: Package, permission: 'purchases' },
  { to: '/orders', label: 'Orders', icon: ClipboardCheck, permission: 'orders' },
  { to: '/dispatch', label: 'Sales & Dispatch', icon: ShoppingCart, permission: 'dispatch' },
  { to: '/sales-analytics', label: 'Sales Analytics', icon: LineChart, permission: 'sales_analytics' },
  { to: '/gate', label: 'Gate Entry', icon: Fence, permission: 'gate' },
  { to: '/otp', label: 'OTP Confirmations', icon: KeyRound, permission: 'otp', badge: 'otp' },
  { to: '/rail-rack', label: 'Rail Rack', icon: Train, permission: 'rail_rack' },
  { to: '/stock', label: 'Godown Stock', icon: Warehouse, permission: 'stock' },
  { to: '/vehicle-ledger', label: 'Vehicle Ledger', icon: Truck, permission: 'vehicle_ledger' },
  { to: '/my-ledger', label: 'My Ledger', icon: Notebook, driverOnly: true },
  { to: '/payments', label: 'Payments', icon: Receipt, permission: 'payments' },
  { to: '/customers', label: 'Customers', icon: Users, permission: 'customers' },
  { to: '/masters', label: 'Masters', icon: ClipboardList, permission: 'masters' },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports' },
  { to: '/users', label: 'User Management', icon: UserCog, ownerOnly: true },
];

function initials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export function Sidebar() {
  const navigate = useNavigate();
  const { user, logout, hasPermission, isOwner } = useAuthStore();
  const { collapsed, toggle } = useSidebarStore();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNavStore();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const [otpCount, setOtpCount] = useState(0);

  useEffect(() => {
    if (!hasPermission('otp')) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await api.dispatches.list({ status: 'dispatched' });
        if (!cancelled) setOtpCount(rows.length);
      } catch { /* ignore — badge just stays stale */ }
    };
    poll();
    const timer = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const isDriver = user?.role === 'driver';
  const items = fullNav.filter((i) => {
    if (i.driverOnly) return isDriver;
    if (isDriver) return false; // drivers only ever see "My Ledger" — no dashboard, no owner nav
    if (i.ownerOnly) return isOwner();
    if (!i.permission) return true;
    return hasPermission(i.permission);
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const body = (
    <div className="flex h-full flex-col bg-[#0F1729] text-slate-200">
      <div className="flex items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-sm font-black text-white shadow-lg shadow-brand-500/30">N</div>
          {!collapsed && (
            <div>
              <p className="text-[15px] font-extrabold leading-tight text-white">NISHANT</p>
              <p className="text-[15px] font-extrabold leading-tight text-brand-400">INFRATECH</p>
            </div>
          )}
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-md shadow-brand-500/25'
                  : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
              }`
            }
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {item.badge === 'otp' && otpCount > 0 && (
              <span className={`ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-amber-950 ${collapsed ? 'absolute -right-1 -top-1 h-4 min-w-[16px] text-[9px]' : ''}`}>
                {otpCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/10 px-2 py-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && <span>Logout</span>}
        </button>

        {user && (
          <div className={`mt-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${collapsed ? 'justify-center' : ''}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
              {initials(user.display_name)}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{user.display_name}</p>
                <p className="truncate text-xs capitalize text-slate-500">{user.role.replace('_', ' ')}</p>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={toggle}
          className="hidden w-full items-center justify-center rounded-lg px-3 py-2 text-slate-500 hover:bg-white/[0.06] hover:text-white lg:flex"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className={`hidden shrink-0 transition-all duration-200 lg:block ${collapsed ? 'w-[76px]' : 'w-[228px]'}`}>
        {body}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu backdrop"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 h-full w-[240px]">{body}</aside>
        </div>
      )}
    </>
  );
}
