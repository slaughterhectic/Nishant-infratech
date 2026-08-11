/**
 * Cross-platform month picker using two <select> elements.
 * Native <input type="month"> renders poorly on macOS Safari/Chrome.
 * Value and onChange use YYYY-MM strings (or '' for unset).
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildYears(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current + 1; y >= 2024; y--) years.push(y);
  return years;
}

const YEARS = buildYears();

interface MonthPickerProps {
  value: string;
  onChange: (ym: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function MonthPicker({ value, onChange, className = '', size = 'sm' }: MonthPickerProps) {
  const [year, month] = value ? value.split('-') : ['', ''];

  const selectClass = `input-field ${size === 'sm' ? 'py-1.5 text-sm' : ''} ${className}`;

  const handleYear = (y: string) => {
    if (!y) { onChange(''); return; }
    onChange(`${y}-${month || String(new Date().getMonth() + 1).padStart(2, '0')}`);
  };

  const handleMonth = (m: string) => {
    if (!m) { onChange(''); return; }
    onChange(`${year || new Date().getFullYear()}-${m}`);
  };

  return (
    <div className="flex items-center gap-1">
      <select className={selectClass} value={month || ''} onChange={(e) => handleMonth(e.target.value)}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={i} value={String(i + 1).padStart(2, '0')}>{name}</option>
        ))}
      </select>
      <select className={selectClass} value={year || ''} onChange={(e) => handleYear(e.target.value)}>
        <option value="">Year</option>
        {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}
