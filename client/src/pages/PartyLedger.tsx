import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, FileText, Wallet2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatDate, formatINR } from '../lib/format';
import { Skeleton } from '../components/ui/Skeleton';
import { downloadLedgerPdf, formatMoneyPdf } from '../lib/pdfLedger';

const TYPE_LABEL: Record<string, string> = {
  purchase: 'Purchase',
  dispatch: 'Dispatch',
  payment_receive: 'Payment Received',
  payment_pay: 'Payment Paid',
};

const TYPE_PILL: Record<string, string> = {
  purchase: 'bg-purchase/10 text-purchase',
  dispatch: 'bg-sale/10 text-sale',
  payment_receive: 'bg-profit/10 text-profit',
  payment_pay: 'bg-outstanding/10 text-outstanding',
};

export default function PartyLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try { setData(await api.parties.ledger(Number(id))); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [id, addToast]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <Skeleton.Card />;

  const openingSigned = data.opening_balance_type === 'dr' ? Number(data.opening_balance) : -Number(data.opening_balance);
  let running = openingSigned;
  const rows = data.ledger.map((r: any) => {
    const prev = running;
    running = Number(r.running_balance);
    const delta = running - prev;
    return { ...r, debit: delta > 0 ? delta : 0, credit: delta < 0 ? -delta : 0 };
  });
  const totalDebit = rows.reduce((s: number, r: any) => s + r.debit, 0);
  const totalCredit = rows.reduce((s: number, r: any) => s + r.credit, 0);
  const closing = rows.length ? Number(rows[rows.length - 1].running_balance) : openingSigned;

  const balanceLabel = (v: number) => `${formatINR(Math.abs(v))} ${v >= 0 ? 'Dr' : 'Cr'}`;

  const fileBase = `${data.party.name.replace(/[^a-z0-9]+/gi, '-')}-ledger`;

  const exportExcel = () => {
    const sheetRows = [
      { Date: '', Type: 'Opening Balance', Remarks: '', Debit: '', Credit: '', Balance: balanceLabel(openingSigned) },
      ...rows.map((r: any) => ({
        Date: formatDate(r.date),
        Type: TYPE_LABEL[r.type] || r.type,
        Remarks: r.remarks || '',
        Debit: r.debit ? formatINR(r.debit) : '',
        Credit: r.credit ? formatINR(r.credit) : '',
        Balance: balanceLabel(r.running_balance),
      })),
      { Date: '', Type: 'Total', Remarks: '', Debit: formatINR(totalDebit), Credit: formatINR(totalCredit), Balance: balanceLabel(closing) },
    ];
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  };

  const balanceLabelPdf = (v: number) => `${formatMoneyPdf(Math.abs(v))} ${v >= 0 ? 'Dr' : 'Cr'}`;

  const exportPdf = () => {
    downloadLedgerPdf({
      documentTitle: 'Customer Ledger Statement',
      subjectName: data.party.name,
      metaLines: [data.party.phone, data.party.address].filter(Boolean),
      summary: [
        { label: 'Opening Balance', value: balanceLabelPdf(openingSigned) },
        { label: 'Total Debit', value: formatMoneyPdf(totalDebit), tone: 'red' },
        { label: 'Total Credit', value: formatMoneyPdf(totalCredit), tone: 'green' },
        { label: 'Closing Balance', value: balanceLabelPdf(closing), tone: closing >= 0 ? 'red' : 'green' },
      ],
      columns: ['Date', 'Type', 'Remarks', 'Debit', 'Credit', 'Balance'],
      rows: [
        ['', 'Opening Balance', '', '', '', balanceLabelPdf(openingSigned)],
        ...rows.map((r: any) => [
          formatDate(r.date),
          TYPE_LABEL[r.type] || r.type,
          r.remarks || '—',
          r.debit ? formatMoneyPdf(r.debit) : '',
          r.credit ? formatMoneyPdf(r.credit) : '',
          balanceLabelPdf(r.running_balance),
        ]),
      ],
      footRow: ['', 'Total', '', formatMoneyPdf(totalDebit), formatMoneyPdf(totalCredit), balanceLabelPdf(closing)],
      numericColumnIndexes: [3, 4, 5],
      filename: `${fileBase}.pdf`,
    });
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/customers')} className="flex items-center gap-1 text-sm text-heading/60 hover:text-heading">
        <ArrowLeft className="h-4 w-4" /> Back to Customers
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">{data.party.name}</h1>
          <p className="text-sm text-heading/50">{[data.party.phone, data.party.address].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportExcel}><Download className="h-4 w-4" /> Excel</button>
          <button className="btn-primary" onClick={exportPdf}><FileText className="h-4 w-4" /> Export PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex flex-col gap-1 !p-4">
          <p className="text-xs uppercase text-heading/40">Opening Balance</p>
          <p className="text-lg font-bold text-heading">{balanceLabel(openingSigned)}</p>
        </div>
        <div className="card flex flex-col gap-1 !p-4">
          <p className="text-xs uppercase text-heading/40">Total Debit</p>
          <p className="text-lg font-bold text-outstanding">{formatINR(totalDebit)}</p>
        </div>
        <div className="card flex flex-col gap-1 !p-4">
          <p className="text-xs uppercase text-heading/40">Total Credit</p>
          <p className="text-lg font-bold text-profit">{formatINR(totalCredit)}</p>
        </div>
        <div className="card flex flex-col gap-1 !p-4">
          <p className="flex items-center gap-1 text-xs uppercase text-heading/40"><Wallet2 className="h-3.5 w-3.5" /> Closing Balance</p>
          <p className={`text-lg font-bold ${closing >= 0 ? 'text-outstanding' : 'text-profit'}`}>{balanceLabel(closing)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface/90 text-left text-xs uppercase tracking-wide text-heading/50 backdrop-blur">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Remarks</th>
              <th className="px-4 py-2.5 text-right">Debit</th>
              <th className="px-4 py-2.5 text-right">Credit</th>
              <th className="px-4 py-2.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            <tr className="bg-surface/40">
              <td className="px-4 py-2.5 text-heading/50" colSpan={5}>Opening Balance</td>
              <td className="px-4 py-2.5 text-right font-medium text-heading/70">{balanceLabel(openingSigned)}</td>
            </tr>
            {rows.map((r: any, i: number) => (
              <tr key={i} className={i % 2 === 1 ? 'bg-surface/20' : ''}>
                <td className="px-4 py-2.5 text-heading/70">{formatDate(r.date)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_PILL[r.type] || 'bg-heading/10 text-heading/60'}`}>
                    {TYPE_LABEL[r.type] || r.type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-heading/60">{r.remarks || '—'}</td>
                <td className="px-4 py-2.5 text-right text-outstanding">{r.debit ? formatINR(r.debit) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-profit">{r.credit ? formatINR(r.credit) : '—'}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${r.running_balance >= 0 ? 'text-outstanding' : 'text-profit'}`}>
                  {balanceLabel(r.running_balance)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-heading/40">No transactions yet</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-card-border bg-surface/60 font-semibold">
                <td className="px-4 py-2.5 text-heading/70" colSpan={3}>Total</td>
                <td className="px-4 py-2.5 text-right text-outstanding">{formatINR(totalDebit)}</td>
                <td className="px-4 py-2.5 text-right text-profit">{formatINR(totalCredit)}</td>
                <td className={`px-4 py-2.5 text-right ${closing >= 0 ? 'text-outstanding' : 'text-profit'}`}>{balanceLabel(closing)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
    </div>
  );
}
