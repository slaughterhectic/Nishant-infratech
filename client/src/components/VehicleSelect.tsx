import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';
import { Modal } from './ui/Modal';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';

interface Vehicle {
  id: number;
  vehicle_number: string;
  kind: string;
  ownership: string;
}

interface VehicleSelectProps {
  label: string;
  required?: boolean;
  value: number | undefined;
  onChange: (vehicleId: number) => void;
}

export function VehicleSelect({ label, required, value, onChange }: VehicleSelectProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [kind, setKind] = useState<'truck' | 'trolley'>('truck');
  const [ownership, setOwnership] = useState<'owned' | 'rented'>('owned');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.vehicles.list().then((rows: any[]) => {
      setVehicles(rows);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const filtered = useMemo(
    () => (search.trim() ? vehicles.filter((v) => v.vehicle_number.toLowerCase().includes(search.trim().toLowerCase())) : vehicles),
    [vehicles, search]
  );
  const selected = vehicles.find((v) => v.id === value);

  function closeAll() {
    setOpen(false);
    setSearch('');
    setCreating(false);
    setNewNumber('');
    setKind('truck');
    setOwnership('owned');
  }

  async function handleSave() {
    if (!newNumber.trim()) return;
    setSaving(true);
    try {
      const vehicle = await api.vehicles.create({ vehicle_number: newNumber.trim(), kind, ownership });
      setVehicles((prev) => [...prev, vehicle]);
      onChange(vehicle.id);
      addToast(`${vehicle.vehicle_number} added`);
      closeAll();
    } catch (e: any) {
      addToast(e.message || 'Could not add vehicle', 'error');
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
        <span className={selected ? 'text-heading' : 'text-heading/40'}>{selected ? selected.vehicle_number : 'Select...'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-heading/40" />
      </button>

      <Modal isOpen={open} onClose={closeAll} title={label}>
        {creating ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-heading/70">Vehicle number<span className="text-outstanding"> *</span></label>
              <input
                className="input-field w-full uppercase"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value.toUpperCase())}
                placeholder="e.g. UP53AB1234"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-heading/70">Kind</label>
                <select className="input-field w-full" value={kind} onChange={(e) => setKind(e.target.value as any)}>
                  <option value="truck">Truck</option>
                  <option value="trolley">Trolley</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-heading/70">Ownership</label>
                <select className="input-field w-full" value={ownership} onChange={(e) => setOwnership(e.target.value as any)}>
                  <option value="owned">Owned</option>
                  <option value="rented">Rented</option>
                </select>
              </div>
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
              className="input-field w-full uppercase"
              placeholder="Search vehicle number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                setNewNumber(search.trim().toUpperCase());
                setCreating(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-brand-500 bg-brand-500/5 px-3 py-3 text-left"
            >
              <Plus className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="text-sm font-semibold text-brand-600">Add a new vehicle</span>
            </button>
            <div className="max-h-80 overflow-y-auto">
              {!loaded ? (
                <p className="py-4 text-center text-sm text-heading/40">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="py-4 text-center text-sm text-heading/40">{search.trim() ? 'No matches' : 'No vehicles yet — add one above'}</p>
              ) : (
                filtered.map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => { onChange(v.id); closeAll(); }}
                    className="flex w-full items-center justify-between border-b border-card-border py-3 text-left last:border-b-0"
                  >
                    <span>
                      <span className="block text-sm text-heading">{v.vehicle_number}</span>
                      <span className="block text-xs capitalize text-heading/40">{v.kind} · {v.ownership}</span>
                    </span>
                    {v.id === value ? <Check className="h-4 w-4 text-brand-600" /> : null}
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

export default VehicleSelect;
