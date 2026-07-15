import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Search } from 'lucide-react';
import { exportReport, getReportData } from '@/api/portalClient';
import { EmptyHint, PageHeader, PrimaryButton, SecondaryButton } from '@/components/payroll/PageElements';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</section>;
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const reports = [
  ['payroll_summary', 'Payroll Summary', 'Monthly payroll totals and processing status'],
  ['staff_payslip_history', 'Staff Payslip History', 'Permanent payslip values by employee and month'],
  ['email_delivery', 'Email Delivery Report', 'Private email delivery attempts and outcomes'],
  ['failed_emails', 'Failed Emails Report', 'Failed and bounced messages requiring attention'],
  ['salary_changes', 'Salary Change Report', 'Old and new salary values with reasons'],
  ['inactive_staff', 'Inactive Staff Report', 'Former staff retained for audit history'],
  ['audit_trail', 'Audit Trail Report', 'User actions, changes, timestamps, and IP addresses'],
];

export default function Reports() {
  const [type, setType] = useState('payroll_summary');
  const [filters, setFilters] = useState({ search: '', month: '', year: '', department: '', branch: '', staff: '' });
  const [data, setData] = useState({ columns: [], rows: [], options: {} });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const load = async (nextType = type, nextFilters = filters, nextPage = page) => { setBusy('load'); try { setData(await getReportData(nextType, { ...nextFilters, page: nextPage, pageSize: 25 })); setError(''); } catch (err) { setError(err.message); } finally { setBusy(''); } };
  useEffect(() => { setPage(1); load(type, filters, 1); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const download = async (format) => { setBusy(format); try { saveBlob(await exportReport(type, format, filters)); setError(''); } catch (err) { setError(err.message); } finally { setBusy(''); } };
  return <div className="space-y-6"><PageHeader title="Management Reports" description="Search, filter, preview, and export verified finance reports from live payroll records." actions={<><SecondaryButton disabled={Boolean(busy)} onClick={() => download('pdf')}><FileText className="h-4 w-4" /> {busy === 'pdf' ? 'Building PDF…' : 'Export PDF'}</SecondaryButton><PrimaryButton disabled={Boolean(busy)} onClick={() => download('xlsx')}><FileSpreadsheet className="h-4 w-4" /> {busy === 'xlsx' ? 'Building Excel…' : 'Export Excel'}</PrimaryButton></>} />
    {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{reports.map(([key, title, note]) => <button key={key} onClick={() => setType(key)} className={`rounded-xl border p-4 text-left transition ${type === key ? 'border-primary bg-primary/[.06] ring-1 ring-primary/20' : 'border-border bg-card hover:border-primary/30'}`}><p className="font-heading font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p></button>)}</div>
    <Card><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7"><label className="relative xl:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input className={`${inputClass} pl-9`} value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Search this report" /></label><input className={inputClass} type="month" value={filters.month} onChange={(event) => update('month', event.target.value)} title="Month" /><input className={inputClass} type="number" min="2000" max="2100" value={filters.year} onChange={(event) => update('year', event.target.value)} placeholder="Year" /><select className={inputClass} value={filters.department} onChange={(event) => update('department', event.target.value)}><option value="">All departments</option>{data.options?.departments?.map((item) => <option key={item}>{item}</option>)}</select><select className={inputClass} value={filters.branch} onChange={(event) => update('branch', event.target.value)}><option value="">All branches</option>{data.options?.branches?.map((item) => <option key={item}>{item}</option>)}</select><select className={inputClass} value={filters.staff} onChange={(event) => update('staff', event.target.value)}><option value="">All staff</option>{data.options?.staff?.map((item) => <option key={item.id} value={`${item.staffId} ${item.name}`}>{item.staffId} · {item.name}</option>)}</select></div><div className="mt-3 flex justify-end gap-2"><SecondaryButton onClick={() => { const empty = { search: '', month: '', year: '', department: '', branch: '', staff: '' }; setFilters(empty); load(type, empty); }}>Clear</SecondaryButton><PrimaryButton disabled={busy === 'load'} onClick={() => load()}><Search className="h-4 w-4" /> Apply Filters</PrimaryButton></div></Card>
    <Card><div className="mb-4 flex items-center justify-between"><div><h2 className="font-heading text-xl font-bold">{data.title || 'Report Preview'}</h2><p className="text-sm text-muted-foreground">{data.pagination?.total ?? data.rows?.length ?? 0} matching records</p></div><Download className="h-5 w-5 text-primary" /></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground"><tr>{data.columns?.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3">{column.label}</th>)}</tr></thead><tbody>{data.rows?.map((row, index) => <tr key={row.id || `${type}-${index}`} className="border-b border-border/60 align-top last:border-0">{data.columns.map((column) => <td key={column.key} className="max-w-xs px-3 py-3">{display(row[column.key])}</td>)}</tr>)}</tbody></table>{!busy && !data.rows?.length && <EmptyHint>No records matched the selected report and filters.</EmptyHint>}</div>{data.pagination?.pages > 1 && <div className="mt-4 flex items-center justify-between border-t border-border pt-4"><SecondaryButton disabled={page <= 1 || Boolean(busy)} onClick={() => { const next = page - 1; setPage(next); load(type, filters, next); }}>Previous</SecondaryButton><span className="text-sm text-muted-foreground">Page {page} of {data.pagination.pages}</span><SecondaryButton disabled={page >= data.pagination.pages || Boolean(busy)} onClick={() => { const next = page + 1; setPage(next); load(type, filters, next); }}>Next</SecondaryButton></div>}</Card>
  </div>;
}

function display(value) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'number') return new Intl.NumberFormat('en-GH', { maximumFractionDigits: 2 }).format(value); if (typeof value === 'object') return JSON.stringify(value); return String(value); }
function saveBlob({ blob, filename }) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
