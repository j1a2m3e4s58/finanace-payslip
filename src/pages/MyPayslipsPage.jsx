import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, Eye, FileText, History, ShieldCheck, WalletCards } from 'lucide-react';
import { getMyPayslipPdf, getMyPayslips } from '@/api/portalClient';
import { EmptyHint, PageHeader, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/payroll/PageElements';
import { toast } from '@/components/ui/use-toast';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</section>;

export default function MyPayslipsPage() {
  const [payslips, setPayslips] = useState([]);
  const [period, setPeriod] = useState('all');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getMyPayslips().then(setPayslips).catch((err) => setError(err.message));
  }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const periods = useMemo(() => [...new Set(payslips.map((item) => item.period))], [payslips]);
  const visible = period === 'all' ? payslips : payslips.filter((item) => item.period === period);
  const replacePreview = (url, title = '') => {
    setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return url; });
    setPreviewTitle(title);
  };
  const preview = async (item) => {
    setBusy(`preview-${item.batchId}`);
    try {
      const result = await getMyPayslipPdf(item.batchId);
      replacePreview(URL.createObjectURL(result.blob), `${formatPeriod(item.period)} payslip`);
      setError('');
    } catch (err) { toast.error(err.message, { title: 'Payslip unavailable' }); }
    finally { setBusy(''); }
  };
  const download = async (item) => {
    setBusy(`download-${item.batchId}`);
    try {
      saveBlob(await getMyPayslipPdf(item.batchId, true));
      toast.success(`${formatPeriod(item.period)} payslip is downloading.`, { title: 'Download ready' });
    } catch (err) { toast.error(err.message, { title: 'Download failed' }); }
    finally { setBusy(''); }
  };

  return <div className="space-y-6">
    <PageHeader eyebrow="Employee self-service" title="My Payslips" description="View and download only your own approved payslip receipts, including previous months." />
    {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-3">
      <Summary icon={WalletCards} label="Available payslips" value={payslips.length} />
      <Summary icon={History} label="Previous periods" value={periods.length} />
      <Summary icon={ShieldCheck} label="Access" value="Private" />
    </div>
    <Card>
      <label htmlFor="my-payslip-period" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Payslip period</label>
      <select id="my-payslip-period" value={period} onChange={(event) => { setPeriod(event.target.value); replacePreview(''); }} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25 sm:max-w-sm">
        <option value="all">All available months</option>
        {periods.map((value) => <option key={value} value={value}>{formatPeriod(value)}</option>)}
      </select>
    </Card>
    <div className="grid gap-4 lg:grid-cols-2">
      {visible.map((item) => <Card key={`${item.batchId}-${item.version}`}>
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="rounded-xl bg-primary/10 p-3 text-primary"><CalendarDays className="h-5 w-5" /></span><div><h2 className="font-heading text-lg font-bold">{formatPeriod(item.period)}</h2><p className="text-xs text-muted-foreground">{item.staffId} · Version {item.version}</p></div></div><StatusBadge status="Approved" /></div>
        <div className="mt-4 rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Net salary</p><p className="mt-1 text-xl font-bold">{formatMoney(item.netSalary)}</p></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><SecondaryButton disabled={Boolean(busy)} onClick={() => preview(item)}><Eye className="h-4 w-4" />{busy === `preview-${item.batchId}` ? 'Opening…' : 'View'}</SecondaryButton><PrimaryButton disabled={Boolean(busy)} onClick={() => download(item)}><Download className="h-4 w-4" />{busy === `download-${item.batchId}` ? 'Preparing…' : 'Download'}</PrimaryButton></div>
      </Card>)}
    </div>
    {!visible.length && <EmptyHint>No approved payslip is available for the selected period. Finance must approve payroll before it appears here.</EmptyHint>}
    {previewUrl && <Card className="overflow-hidden p-0"><div className="flex items-center gap-3 border-b border-border p-4"><FileText className="h-5 w-5 text-primary" /><div><h2 className="font-heading font-bold">{previewTitle}</h2><p className="text-xs text-muted-foreground">Confidential employee document</p></div></div><iframe title={previewTitle} src={`${previewUrl}#view=FitH&toolbar=1&navpanes=0`} className="h-[68vh] min-h-[480px] w-full border-0 bg-white" /></Card>}
    <p className="text-center text-xs text-muted-foreground">The server links this page to your Staff Directory record. Changing the browser address cannot reveal another employee's salary.</p>
  </div>;
}

function Summary({ icon: Icon, label, value }) { return <Card className="flex items-center gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="font-heading text-xl font-bold">{value}</p></div></Card>; }
function formatPeriod(value) { const [year, month] = String(value || '').split('-').map(Number); return year && month ? new Date(year, month - 1, 1).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }) : value; }
function formatMoney(value) { return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value || 0)); }
function saveBlob({ blob, filename }) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
