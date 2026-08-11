import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { api } from '../lib/api';
import { Eye, EyeOff, Package } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user, permissions } = await api.auth.login(username.trim(), password);
      setAuth(token, user, permissions);
      if (user.role === 'driver') navigate('/my-ledger');
      else if (user.role === 'gatekeeper' || user.role === 'godown_manager') navigate('/gate');
      else navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-[#0F1729] via-slate-800 to-[#0F1729]">
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 text-white">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-500/20 ring-2 ring-brand-400/30">
            <Package className="h-10 w-10 text-brand-400" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            NISHANT <span className="text-brand-400">INFRATECH</span>
          </h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-slate-400">Cement &amp; Sariya Trading</p>
          <p className="mt-6 text-sm leading-relaxed text-slate-400">
            Godown stock, dispatch tokens, OTP-confirmed deliveries and vehicle trip
            ledgers — one platform, real-time.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl dark:bg-[#181B29]">
          <div className="mb-6 text-center lg:hidden">
            <h1 className="text-2xl font-bold text-heading">
              NISHANT <span className="text-brand-500">INFRATECH</span>
            </h1>
          </div>
          <h2 className="mb-6 text-xl font-semibold text-heading">Sign in</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Username</label>
              <input
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Password</label>
              <div className="relative">
                <input
                  className="input-field pr-10"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-heading/40 hover:text-heading"
                  onClick={() => setShowPassword((s) => !s)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
