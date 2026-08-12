import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';
import { Modal } from './ui/Modal';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, isValidMobileNumber, toE164 } from '../lib/phone';

interface Driver {
  id: number;
  name: string;
  phone: string | null;
}

interface DriverSelectProps {
  label: string;
  required?: boolean;
  value: number | undefined;
  onChange: (driverId: number) => void;
}

export function DriverSelect({ label, required, value, onChange }: DriverSelectProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [newPhone, setNewPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.drivers.list().then((rows: any[]) => {
      setDrivers(rows);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const filtered = useMemo(
    () => (search.trim() ? drivers.filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase())) : drivers),
    [drivers, search]
  );
  const selected = drivers.find((d) => d.id === value);

  function closeAll() {
    setOpen(false);
    setSearch('');
    setCreating(false);
    setNewName('');
    setCountryCode(DEFAULT_COUNTRY_CODE);
    setNewPhone('');
    setPhoneError(null);
  }

  async function handleSave() {
    if (!newName.trim()) return;
    if (newPhone && !isValidMobileNumber(countryCode, newPhone)) {
      setPhoneError('Enter a valid mobile number');
      return;
    }
    setPhoneError(null);
    setSaving(true);
    try {
      const driver = await api.drivers.create({ name: newName.trim(), phone: newPhone ? toE164(countryCode, newPhone) : undefined });
      setDrivers((prev) => [...prev, driver]);
      onChange(driver.id);
      addToast(`${driver.name} added`);
      closeAll();
    } catch (e: any) {
      addToast(e.message || 'Could not add driver', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-heading/70">
        {label}
        {required ? <span className="text-outstanding"> *</span> : null}
      </label>
      <button type="button" onClick={() => setOpen(true)} className="input-field flex w-full items-center justify-between text-left">
        <span className={selected ? 'text-heading' : 'text-heading/40'}>{selected ? selected.name : 'Select...'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-heading/40" />
      </button>

      <Modal isOpen={open} onClose={closeAll} title={label}>
        {creating ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-heading/70">Name<span className="text-outstanding"> *</span></label>
              <input className="input-field w-full" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-heading/70">Mobile number</label>
              <div className="flex gap-2">
                <select className="input-field w-36" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.dialCode} value={c.dialCode}>{c.name} {c.dialCode}</option>
                  ))}
                </select>
                <input
                  className="input-field w-full"
                  value={newPhone}
                  onChange={(e) => { setNewPhone(e.target.value); setPhoneError(null); }}
                  placeholder="Mobile number"
                />
              </div>
              {phoneError ? <p className="text-xs text-outstanding">{phoneError}</p> : null}
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => setCreating(false)}>Back</button>
              <button type="button" className="btn-primary flex-1 justify-center" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              autoFocus
              className="input-field w-full"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              onClick={() => { setNewName(search.trim()); setCreating(true); }}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-brand-500 bg-brand-500/5 px-3 py-3 text-left"
            >
              <Plus className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="text-sm font-semibold text-brand-600">Add a new driver</span>
            </button>
            <div className="max-h-80 overflow-y-auto">
              {!loaded ? (
                <p className="py-4 text-center text-sm text-heading/40">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="py-4 text-center text-sm text-heading/40">{search.trim() ? 'No matches' : 'No drivers yet — add one above'}</p>
              ) : (
                filtered.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => { onChange(d.id); closeAll(); }}
                    className="flex w-full items-center justify-between border-b border-card-border py-3 text-left last:border-b-0"
                  >
                    <span>
                      <span className="block text-sm text-heading">{d.name}</span>
                      {d.phone ? <span className="block text-xs text-heading/40">{d.phone}</span> : null}
                    </span>
                    {d.id === value ? <Check className="h-4 w-4 text-brand-600" /> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default DriverSelect;
