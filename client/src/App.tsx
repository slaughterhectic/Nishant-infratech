import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import SalesDispatch from './pages/SalesDispatch';
import SalesAnalytics from './pages/SalesAnalytics';
import OtpConfirmations from './pages/OtpConfirmations';
import GateEntry from './pages/GateEntry';
import GodownStock from './pages/GodownStock';
import Purchases from './pages/Purchases';
import VehicleLedger from './pages/VehicleLedger';
import Payments from './pages/Payments';
import Customers from './pages/Customers';
import PartyLedger from './pages/PartyLedger';
import Masters from './pages/Masters';
import Reports from './pages/Reports';
import UserManagement from './pages/UserManagement';
import RailRack from './pages/RailRack';
import MyLedger from './pages/MyLedger';
import { useAuthStore } from './lib/store';

// Dashboard is owner-only, so it can no longer be the universal fallback
// every guard below redirects to (that would loop: guard denies -> /dashboard
// -> OwnerOnly denies -> /dashboard -> ...). This picks a safe, role-
// appropriate landing page instead — one each role is actually guaranteed
// to have access to.
function safeHomePath(user: { role?: string } | null | undefined): string {
  if (!user) return '/login';
  if (user.role === 'owner') return '/dashboard';
  if (user.role === 'driver') return '/my-ledger';
  if (user.role === 'gatekeeper' || user.role === 'godown_manager') return '/gate';
  if (user.role === 'collection_staff') return '/payments';
  return '/orders'; // accountant, and any future role defaulting through here
}

function Protected({ children }: { children: ReactNode }) {
  const ok = useAuthStore((s) => s.isAuthenticated);
  const refreshPermissions = useAuthStore((s) => s.refreshPermissions);
  useEffect(() => {
    if (!ok) return;
    refreshPermissions();
    const timer = setInterval(refreshPermissions, 30_000);
    return () => clearInterval(timer);
  }, [ok, refreshPermissions]);
  if (!ok) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PermissionGuard({ permission, children }: { permission: string; children: ReactNode }) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const user = useAuthStore((s) => s.user);
  if (!hasPermission(permission)) return <Navigate to={safeHomePath(user)} replace />;
  return <>{children}</>;
}

function OwnerOnly({ children }: { children: ReactNode }) {
  const isOwner = useAuthStore((s) => s.isOwner);
  const user = useAuthStore((s) => s.user);
  if (!isOwner()) return <Navigate to={safeHomePath(user)} replace />;
  return <>{children}</>;
}

// A driver's own ledger isn't part of the owner-configurable permission
// matrix — any user with role='driver' automatically gets this, always.
function DriverOnly({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'driver') return <Navigate to={safeHomePath(user)} replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  return <Navigate to={safeHomePath(user)} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/dashboard" element={<OwnerOnly><Dashboard /></OwnerOnly>} />
          <Route
            path="/purchases"
            element={<PermissionGuard permission="purchases"><Purchases /></PermissionGuard>}
          />
          <Route
            path="/orders"
            element={<PermissionGuard permission="orders"><Orders /></PermissionGuard>}
          />
          <Route
            path="/dispatch"
            element={<PermissionGuard permission="dispatch"><SalesDispatch /></PermissionGuard>}
          />
          <Route
            path="/sales-analytics"
            element={<PermissionGuard permission="sales_analytics"><SalesAnalytics /></PermissionGuard>}
          />
          <Route
            path="/gate"
            element={<PermissionGuard permission="gate"><GateEntry /></PermissionGuard>}
          />
          <Route
            path="/otp"
            element={<PermissionGuard permission="otp"><OtpConfirmations /></PermissionGuard>}
          />
          <Route
            path="/stock"
            element={<PermissionGuard permission="stock"><GodownStock /></PermissionGuard>}
          />
          <Route
            path="/rail-rack"
            element={<PermissionGuard permission="rail_rack"><RailRack /></PermissionGuard>}
          />
          <Route
            path="/my-ledger"
            element={<DriverOnly><MyLedger /></DriverOnly>}
          />
          <Route
            path="/vehicle-ledger"
            element={<PermissionGuard permission="vehicle_ledger"><VehicleLedger /></PermissionGuard>}
          />
          <Route
            path="/vehicle-ledger/:driverId"
            element={<PermissionGuard permission="vehicle_ledger"><MyLedger /></PermissionGuard>}
          />
          <Route
            path="/payments"
            element={<PermissionGuard permission="payments"><Payments /></PermissionGuard>}
          />
          <Route
            path="/customers"
            element={<PermissionGuard permission="customers"><Customers /></PermissionGuard>}
          />
          <Route
            path="/customers/:id"
            element={<PermissionGuard permission="customers"><PartyLedger /></PermissionGuard>}
          />
          <Route
            path="/masters"
            element={<PermissionGuard permission="masters"><Masters /></PermissionGuard>}
          />
          <Route
            path="/reports"
            element={<PermissionGuard permission="reports"><Reports /></PermissionGuard>}
          />
          <Route
            path="/users"
            element={<OwnerOnly><UserManagement /></OwnerOnly>}
          />
        </Route>
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
