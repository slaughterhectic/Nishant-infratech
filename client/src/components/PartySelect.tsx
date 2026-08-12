import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, UserPlus, Check } from 'lucide-react';
import { Modal } from './ui/Modal';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, isValidMobileNumber, toE164 } from '../lib/phone';

interface Party {
  id: number;
  name: string;
  phone: string | null;
  type: string;
}

interface PartySelectProps {
  label: string;
  required?: boolean;
  value: number | undefined;
  onChange: (partyId: number) => void;
  // 'customer' covers every non-supplier party type (dealer/contractor/builder/institution/other).
  partyType: 'customer' | 'supplier';
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function nextAvailableName(baseName: string, existing: Party[]): string {
  const trimmed = baseName.trim();
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = `${trimmed} (${n})`;
    if (!existing.some((p) => namesMatch(p.name, candidate))) return candidate;
    n += 1;
  }
}

export function PartySelect({ label, required, value, onChange, partyType }: PartySelectProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [parties, setParties] = useState<Party[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [newPhone, setNewPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pendingDuplicateName, setPendingDuplicateName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.parties.list().then((rows: any[]) => {
      setParties(rows);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const scoped = useMemo(
    () => parties.filter((p) => (partyType === 'supplier' ? p.type === 'supplier' : p.type !== 'supplier')),
    [parties, partyType]
  );
  const filtered = useMemo(
    () => (search.trim() ? scoped.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase())) : scoped),
    [scoped, search]
  );
  const exactMatchExists = search.trim().length > 0 && scoped.some((p) => namesMatch(p.name, search));
  const selected = parties.find((p) => p.id === value);

  function resetCreateState() {
    setCreating(false);
    setNewName('');
    setCountryCode(DEFAULT_COUNTRY_CODE);
    setNewPhone('');
    setPhoneError(null);
    setPendingDuplicateName(null);
  }

  function closeAll() {
    setOpen(false);
    setSearch('');
    resetCreateState();
  }

  function startCreate() {
    setNewName(search.trim());
    setCreating(true);
    setPendingDuplicateName(null);
  }

  async function handleSave() {
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    if (!isValidMobileNumber(countryCode, newPhone)) {
      setPhoneError('Enter a valid mobile number');
      return;
    }
    setPhoneError(null);

    const finalName = pendingDuplicateName ?? (() => {
      const duplicate = parties.find((p) => namesMatch(p.name, trimmedName));
      return duplicate ? null : trimmedName;
    })();

    if (finalName === null) {
      setPendingDuplicateName(nextAvailableName(trimmedName, parties));
      return;
    }

    setSaving(true);
    try {
      const party = await api.parties.create({
        name: finalName,
        phone: toE164(countryCode, newPhone),
        type: partyType === 'supplier' ? 'supplier' : 'dealer',
      });
      setParties((prev) => [...prev, party]);
      onChange(party.id);
      addToast(`${party.name} added`);
      closeAll();
    } catch (e: any) {
      addToast(e.message || 'Could not add party', 'error');
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="input-field flex w-full items-center justify-between text-left"
      >
        <span className={selected ? 'text-heading' : 'text-heading/40'}>{selected ? selected.name : 'Select...'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-heading/40" />
      </button>

      <Modal isOpen={open} onClose={closeAll} title={label}>
        {creating ? (
          <div className="space-y-4">
            <p className="text-sm text-heading/60">Add a new {partyType === 'supplier' ? 'supplier' : 'customer'}</p>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-heading/70">
                Name<span className="text-outstanding"> *</span>
              </label>
              <input className="input-field w-full" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-heading/70">
                Mobile number<span className="text-outstanding"> *</span>
              </label>
              <div className="flex gap-2">
                <select
                  className="input-field w-36"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.dialCode} value={c.dialCode}>{c.name} {c.dialCode}</option>
                  ))}
                </select>
                <input
                  className="input-field w-full"
                  value={newPhone}
                  onChange={(e) => {
                    setNewPhone(e.target.value);
                    setPhoneError(null);
                    setPendingDuplicateName(null);
                  }}
                  placeholder="Mobile number"
                />
              </div>
              {phoneError ? <p className="text-xs text-outstanding">{phoneError}</p> : null}
            </div>
            {pendingDuplicateName ? (
              <div className="rounded-lg bg-stock-warn/10 p-3">
                <p className="text-xs font-medium text-stock-warn">
                  A {partyType === 'supplier' ? 'supplier' : 'customer'} named "{newName.trim()}" already exists.
                  Saving will add this one as "{pendingDuplicateName}" instead.
                </p>
              </div>
            ) : null}
            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => setCreating(false)}>Back</button>
              <button type="button" className="btn-primary flex-1 justify-center" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : pendingDuplicateName ? 'Save anyway' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-heading/30" />
              <input
                autoFocus
                className="input-field w-full pl-9"
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={startCreate}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-brand-500 bg-brand-500/5 px-3 py-3 text-left"
            >
              <UserPlus className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="text-sm font-semibold text-brand-600">
                {search.trim() && !exactMatchExists
                  ? `Add "${search.trim()}" as new ${partyType === 'supplier' ? 'supplier' : 'customer'}`
                  : `Add a new ${partyType === 'supplier' ? 'supplier' : 'customer'}`}
              </span>
            </button>
            <div className="max-h-80 overflow-y-auto">
              {!loaded ? (
                <p className="py-4 text-center text-sm text-heading/40">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="py-4 text-center text-sm text-heading/40">{search.trim() ? 'No matches' : 'No parties yet — add one above'}</p>
              ) : (
                filtered.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      onChange(p.id);
                      closeAll();
                    }}
                    className="flex w-full items-center justify-between border-b border-card-border py-3 text-left last:border-b-0"
                  >
                    <span>
                      <span className="block text-sm text-heading">{p.name}</span>
                      {p.phone ? <span className="block text-xs text-heading/40">{p.phone}</span> : null}
                    </span>
                    {p.id === value ? <Check className="h-4 w-4 text-brand-600" /> : null}
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

export default PartySelect;
