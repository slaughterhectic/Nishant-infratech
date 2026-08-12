const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('ni_token');
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${url}`, { headers, ...options });
  if (res.status === 401) {
    localStorage.removeItem('ni_token');
    localStorage.removeItem('ni_user');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function qs(params?: Record<string, string | number | undefined>) {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string; user: any; permissions: string[] }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    me: () => request<{ user: any; permissions: string[] }>('/auth/me'),
    listUsers: () => request<any[]>('/auth/users'),
    createUser: (data: { username: string; password: string; display_name: string; role: string; driver_id?: number; location_id?: number }) =>
      request<any>('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id: number, data: Partial<{ display_name: string; role: string; is_active: number; driver_id: number; location_id: number }>) =>
      request<any>(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updatePermissions: (id: number, permissions: string[]) =>
      request<any>(`/auth/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),
    resetPassword: (id: number, new_password: string) =>
      request<any>(`/auth/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password }) }),
    deleteUser: (id: number) => request<any>(`/auth/users/${id}`, { method: 'DELETE' }),
  },

  parties: {
    list: () => request<any[]>('/parties'),
    get: (id: number) => request<any>(`/parties/${id}`),
    ledger: (id: number) => request<any>(`/parties/${id}/ledger`),
    create: (data: any) => request<any>('/parties', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/parties/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/parties/${id}`, { method: 'DELETE' }),
  },

  products: {
    list: (category?: string) => request<any[]>(`/products${qs({ category })}`),
    create: (data: any) => request<any>('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/products/${id}`, { method: 'DELETE' }),
  },

  locations: {
    list: () => request<any[]>('/locations'),
    create: (data: any) => request<any>('/locations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/locations/${id}`, { method: 'DELETE' }),
  },

  vehicles: {
    list: () => request<any[]>('/vehicles'),
    create: (data: any) => request<any>('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/vehicles/${id}`, { method: 'DELETE' }),
  },

  drivers: {
    list: () => request<any[]>('/drivers'),
    create: (data: any) => request<any>('/drivers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/drivers/${id}`, { method: 'DELETE' }),
  },

  purchases: {
    list: (params?: Record<string, string>) => request<any[]>(`/purchases${qs(params)}`),
    lots: (productId: number, locationId: number) => request<any[]>(`/purchases/lots${qs({ product_id: productId, location_id: locationId })}`),
    create: (data: any) => request<any>('/purchases', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/purchases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/purchases/${id}`, { method: 'DELETE' }),
  },

  stock: {
    list: (all?: boolean) => request<any[]>(`/stock${qs({ all: all ? '1' : undefined })}`),
    byLocation: (locationId: number) => request<any[]>(`/stock/by-location/${locationId}`),
    summary: () => request<any[]>('/stock/summary'),
    openingList: () => request<any[]>('/stock/opening'),
    openingUpsert: (data: any) => request<any>('/stock/opening', { method: 'POST', body: JSON.stringify(data) }),
    openingDelete: (id: number) => request<any>(`/stock/opening/${id}`, { method: 'DELETE' }),
  },

  dispatches: {
    list: (params?: Record<string, string>) => request<any[]>(`/dispatches${qs(params)}`),
    get: (id: number) => request<any>(`/dispatches/${id}`),
    punch: (data: any) => request<any>('/dispatches/punch', { method: 'POST', body: JSON.stringify(data) }),
    fulfill: (id: number, data: any) => request<any>(`/dispatches/${id}/fulfill`, { method: 'POST', body: JSON.stringify(data) }),
    verifyOtp: (id: number, otp: string) => request<any>(`/dispatches/${id}/otp/verify`, { method: 'POST', body: JSON.stringify({ otp }) }),
    discardDriverOtp: (id: number) => request<any>(`/dispatches/${id}/otp/discard-driver-entry`, { method: 'PATCH' }),
    cancel: (id: number) => request<any>(`/dispatches/${id}/cancel`, { method: 'PATCH' }),
    update: (id: number, data: any) => request<any>(`/dispatches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/dispatches/${id}`, { method: 'DELETE' }),
  },

  orderRequests: {
    list: (status?: string) => request<any[]>(`/order-requests${qs({ status })}`),
    create: (data: any) => request<any>('/order-requests', { method: 'POST', body: JSON.stringify(data) }),
    proceed: (id: number, dispatchId: number) => request<any>(`/order-requests/${id}/proceed`, { method: 'PATCH', body: JSON.stringify({ dispatch_id: dispatchId }) }),
    discard: (id: number) => request<any>(`/order-requests/${id}/discard`, { method: 'PATCH' }),
    delete: (id: number) => request<any>(`/order-requests/${id}`, { method: 'DELETE' }),
  },

  notifications: {
    list: (limit?: number) => request<any[]>(`/notifications${qs({ limit })}`),
    unreadCount: () => request<{ count: number }>('/notifications/unread-count'),
    markRead: () => request<any>('/notifications/mark-read', { method: 'POST' }),
  },

  vehicleTrips: {
    list: (params?: Record<string, string>) => request<any[]>(`/vehicle-trips${qs(params)}`),
    get: (id: number) => request<any>(`/vehicle-trips/${id}`),
    create: (data: any) => request<any>('/vehicle-trips', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/vehicle-trips/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/vehicle-trips/${id}`, { method: 'DELETE' }),
  },

  payments: {
    list: (partyId?: number) => request<any[]>(`/payments${qs({ party_id: partyId })}`),
    create: (data: any) => request<any>('/payments', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/payments/${id}`, { method: 'DELETE' }),
  },

  expenses: {
    list: (month?: string) => request<any[]>(`/expenses${qs({ month })}`),
    create: (data: any) => request<any>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<any>(`/expenses/${id}`, { method: 'DELETE' }),
  },

  reports: {
    sales: (month?: string) => request<any[]>(`/reports/sales${qs({ month })}`),
    purchases: (month?: string) => request<any[]>(`/reports/purchases${qs({ month })}`),
    outstanding: () => request<{ receivable: any[]; payable: any[] }>('/reports/outstanding'),
    pnl: (month?: string) => request<any>(`/reports/pnl${qs({ month })}`),
    salesAnalytics: (month?: string) => request<any>(`/reports/sales-analytics${qs({ month })}`),
  },

  settings: {
    get: () => request<Record<string, string>>('/settings'),
    update: (key: string, value: string) => request<any>(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  },

  dashboard: {
    stats: () => request<any>('/dashboard/stats'),
    charts: () => request<any>('/dashboard/charts'),
  },

  railRack: {
    listWagons: () => request<any[]>('/rail-rack/wagons'),
    createWagon: (data: any) => request<any>('/rail-rack/wagons', { method: 'POST', body: JSON.stringify(data) }),
  },

  driver: {
    myDeliveries: () => request<any[]>('/driver/my-deliveries'),
    requestAdvance: (amount: number, note?: string) =>
      request<any>('/driver/request-advance', { method: 'POST', body: JSON.stringify({ amount, note }) }),
    submitOtp: (dispatchId: number, otp: string) =>
      request<any>('/driver/submit-otp', { method: 'POST', body: JSON.stringify({ dispatch_id: dispatchId, otp }) }),
  },
};
