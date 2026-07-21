import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, Eye, FileSpreadsheet, FileText, Filter, Search } from 'lucide-react';
import { exportReport, getReportData } from '@/api/portalClient';
import { EmptyHint, PageHeader, PrimaryButton, SecondaryButton } from '@/components/payroll/PageElements';
import { toast } from '@/components/ui/use-toast';
import ResponsiveSheet from '@/components/ui/responsive-sheet';

const REPORTS = [
  ['payroll_summary', 'Payroll Summary', 'Monthly payroll totals and processing status'],
  ['staff_payslip_history', 'Staff Payslip History', 'Permanent payslip values by employee and month'],
  ['email_delivery', 'Email Delivery Report', 'Private email delivery attempts and outcomes'],
  ['failed_emails', 'Failed Emails Report', 'Failed and bounced messages requiring attention'],
  ['salary_changes', 'Salary Change Report', 'Old and new salary values with reasons'],
  ['inactive_staff', 'Inactive Staff Report', 'Former staff retained for audit history'],
  ['audit_trail', 'Audit Trail Report', 'User actions, changes, timestamps, and IP addresses'],
];
const emptyFilters = { search: '', month: '', year: '', department: '', branch: '', staff: '', dateFrom: '', dateTo: '' };
const inputClass = 'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</section>;

export default function Reports() {
  const [type, setType] = useState('payroll_summary');
  const [filters, setFilters] = useState(emptyFilters);
  const [data, setData] = useState({ columns: [], rows: [], options: {}, pagination: {} });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [savedFilters, setSavedFilters] = useState([]);
  const [saveName, setSaveName] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => { window.localStorage.removeItem('bcb_report_saved_filters'); }, []);

  const load = async (nextType = type, nextFilters = filters, nextPage = page, nextSize = pageSize) => {
    setBusy('load');
    try {
      const result = await getReportData(nextType, { ...nextFilters, page: nextPage, pageSize: nextSize });
      setData(result);
      setVisibleColumns((current) => current.length ? current.filter((key) => result.columns.some((column) => column.key === key)) : result.columns.map((column) => column.key));
      setError('');
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };
  useEffect(() => { setPage(1); setVisibleColumns([]); load(type, filters, 1, pageSize); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo(() => data.columns.filter((column) => visibleColumns.includes(column.key)), [data.columns, visibleColumns]);
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const apply = (next = filters) => { setPage(1); load(type, next, 1, pageSize); };
  const setDateShortcut = (shortcut) => { const next = { ...filters, ...dateRange(shortcut) }; setFilters(next); apply(next); };
  const saveCurrentFilter = () => {
    const name = saveName.trim();
    if (!name) return;
    const next = [...savedFilters.filter((item) => !(item.name === name && item.type === type)), { name, type, filters }];
    setSavedFilters(next); setSaveName('');
    toast.success('This filter is available only until you leave or refresh this page.', { title: 'Temporary filter saved' });
  };
  const applySavedFilter = (index) => { const item = savedFilters[index]; if (!item) return; setType(item.type); setFilters({ ...emptyFilters, ...item.filters }); setPage(1); window.setTimeout(() => load(item.type, { ...emptyFilters, ...item.filters }, 1, pageSize), 0); };
  const removeSavedFilter = (index) => setSavedFilters((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const download = async (format) => { setBusy(format); try { saveBlob(await exportReport(type, format, filters)); toast.success('The export contains every record matching the filters, not only this screen page.', { title: 'Full report ready' }); } catch (err) { setError(err.message); } finally { setBusy(''); } };

  return <div className="space-y-6">
    <PageHeader title="Management Reports" description="Search live records on screen, inspect each result, and export full filtered reports." />
    {error && <Banner>{error}</Banner>}
    <Card className="sm:hidden"><label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Report type</label><select className={`${inputClass} mt-2`} value={type} onChange={(event) => setType(event.target.value)}>{REPORTS.map(([key,title]) => <option key={key} value={key}>{title}</option>)}</select><p className="mt-2 text-xs leading-5 text-muted-foreground">{REPORTS.find(([key]) => key === type)?.[2]}</p></Card>
    <div className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">{REPORTS.map(([key, title, note]) => <button key={key} onClick={() => setType(key)} className={`rounded-xl border p-4 text-left transition ${type === key ? 'border-primary bg-primary/[.06] ring-1 ring-primary/20' : 'border-border bg-card hover:border-primary/30'}`}><p className="font-heading font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p></button>)}</div>

    <Card>
      <button type="button" onClick={() => setFiltersOpen((current) => !current)} className="mb-3 flex min-h-11 w-full items-center justify-between rounded-lg border border-border px-3 text-sm font-semibold md:hidden" aria-expanded={filtersOpen}><span className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /> Report filters</span><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">{Object.values(filters).filter(Boolean).length} active</span></button>
      <div className={`${filtersOpen ? 'block' : 'hidden'} md:block`}>
      <div className="mb-4 flex flex-wrap items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{[['today','Today'],['7days','Last 7 days'],['month','This month'],['year','This year'],['all','All time']].map(([key,label]) => <button key={key} onClick={() => setDateShortcut(key)} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary">{label}</button>)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="relative xl:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input className={`${inputClass} pl-9`} value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Search this report" /></label><input className={inputClass} type="date" value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} aria-label="From date" /><input className={inputClass} type="date" value={filters.dateTo} onChange={(event) => update('dateTo', event.target.value)} aria-label="To date" /><input className={inputClass} type="month" value={filters.month} onChange={(event) => update('month', event.target.value)} aria-label="Payroll month" /><input className={inputClass} type="number" min="2000" max="2100" value={filters.year} onChange={(event) => update('year', event.target.value)} placeholder="Year" /><Select value={filters.department} onChange={(value) => update('department', value)} label="All departments" options={data.options?.departments} /><Select value={filters.branch} onChange={(value) => update('branch', value)} label="All branches" options={data.options?.branches} /><select className={inputClass} value={filters.staff} onChange={(event) => update('staff', event.target.value)}><option value="">All staff</option>{data.options?.staff?.map((item) => <option key={item.id} value={`${item.staffId} ${item.name}`}>{item.staffId} · {item.name}</option>)}</select></div>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div className="flex flex-1 flex-wrap gap-2"><input className={`${inputClass} max-w-56`} value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="Name this filter" /><SecondaryButton onClick={saveCurrentFilter} disabled={!saveName.trim()}><Filter className="h-4 w-4" /> Save filter</SecondaryButton><select className={`${inputClass} max-w-60`} defaultValue="" onChange={(event) => { if (event.target.value !== '') applySavedFilter(Number(event.target.value)); event.target.value = ''; }}><option value="">Saved filters</option>{savedFilters.map((item,index) => <option key={`${item.type}-${item.name}`} value={index}>{item.name} · {reportLabel(item.type)}</option>)}</select>{savedFilters.length > 0 && <button className="text-xs font-semibold text-red-600" onClick={() => { const index = savedFilters.findIndex((item) => item.type === type); if (index >= 0) removeSavedFilter(index); }}>Delete first saved filter for this report</button>}</div><div className="grid grid-cols-2 gap-2 sm:flex"><SecondaryButton onClick={() => { setFilters(emptyFilters); apply(emptyFilters); }}>Clear</SecondaryButton><PrimaryButton disabled={busy === 'load'} onClick={() => { apply(); setFiltersOpen(false); }}><Search className="h-4 w-4" /> Apply filters</PrimaryButton></div></div>
      </div>
    </Card>

    <Card className="border-primary/20 bg-primary/[.025]"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-heading text-lg font-bold">Exported report</p><p className="text-sm text-muted-foreground">Screen results below show page {page}. PDF and Excel include all {data.pagination?.total ?? data.rows.length} records matching your current filters.</p></div><div className="flex flex-col gap-2 sm:flex-row"><SecondaryButton disabled={Boolean(busy)} onClick={() => download('pdf')}><FileText className="h-4 w-4" /> {busy === 'pdf' ? 'Building PDF…' : 'Export all to PDF'}</SecondaryButton><PrimaryButton disabled={Boolean(busy)} onClick={() => download('xlsx')}><FileSpreadsheet className="h-4 w-4" /> {busy === 'xlsx' ? 'Building Excel…' : 'Export all to Excel'}</PrimaryButton></div></div></Card>

    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-xl font-bold">On-screen results</h2><p className="text-sm text-muted-foreground">{data.pagination?.total ?? data.rows.length} matching records · {data.rows.length} on this page</p></div><ColumnPicker columns={data.columns} visible={visibleColumns} onToggle={(key) => setVisibleColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} /></div>
      <div className="grid gap-3 md:hidden">{data.rows.map((row,index) => <article key={row.id || `${type}-${index}`} className="rounded-xl border border-border p-4"><div className="space-y-2">{columns.slice(0,4).map((column) => <RecordValue key={column.key} label={column.label} value={row[column.key]} />)}</div><SecondaryButton className="mt-4 w-full" onClick={() => setSelected(row)}><Eye className="h-4 w-4" /> View full record</SecondaryButton></article>)}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground"><tr>{columns.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3">{column.label}</th>)}<th className="px-3 py-3">Details</th></tr></thead><tbody>{data.rows.map((row,index) => <tr key={row.id || `${type}-${index}`} className="border-b border-border/60 align-top last:border-0">{columns.map((column) => <td key={column.key} className="max-w-xs break-words px-3 py-3">{display(row[column.key])}</td>)}<td className="px-3 py-2"><button onClick={() => setSelected(row)} className="rounded-lg p-2 text-primary hover:bg-primary/10" title="View full record"><Eye className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
      {!busy && !data.rows.length && <EmptyHint>No records matched the selected report and filters.</EmptyHint>}
      <Pagination page={page} pages={data.pagination?.pages || 1} pageSize={pageSize} busy={Boolean(busy)} onPage={(next) => { setPage(next); load(type, filters, next, pageSize); }} onSize={(size) => { setPageSize(size); setPage(1); load(type, filters, 1, size); }} />
    </Card>
    <DetailsDrawer open={Boolean(selected)} title="Report record details" columns={data.columns} row={selected} onClose={() => setSelected(null)} />
  </div>;
}

function ColumnPicker({ columns, visible, onToggle }) { return <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold"><Columns3 className="h-4 w-4" /> Columns ({visible.length}/{columns.length})</summary><div className="absolute right-0 z-20 mt-2 max-h-72 w-64 overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-xl">{columns.map((column) => <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted"><input type="checkbox" checked={visible.includes(column.key)} onChange={() => onToggle(column.key)} />{column.label}</label>)}</div></details>; }
function DetailsDrawer({ open, title, columns, row, onClose }) { return <ResponsiveSheet open={open && Boolean(row)} onOpenChange={(next) => !next && onClose()} title={title} description="Complete values for the selected report record."><div className="space-y-3">{row && columns.map((column) => <RecordValue key={column.key} label={column.label} value={row[column.key]} panel />)}</div></ResponsiveSheet>; }
function RecordValue({ label, value, panel = false }) { return <div className={panel ? 'rounded-xl border border-border bg-background p-4' : ''}><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{display(value)}</p></div>; }
function Pagination({ page, pages, pageSize, busy, onPage, onSize }) { return <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><select className={`${inputClass} w-36`} value={pageSize} onChange={(event) => onSize(Number(event.target.value))}><option value="10">10 per page</option><option value="25">25 per page</option><option value="50">50 per page</option><option value="100">100 per page</option></select><div className="flex items-center justify-between gap-3"><SecondaryButton disabled={page <= 1 || busy} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Previous</SecondaryButton><span className="whitespace-nowrap text-sm text-muted-foreground">Page {page} of {pages}</span><SecondaryButton disabled={page >= pages || busy} onClick={() => onPage(page + 1)}>Next <ChevronRight className="h-4 w-4" /></SecondaryButton></div></div>; }
function Select({ value, onChange, label, options = [] }) { return <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((item) => <option key={item}>{item}</option>)}</select>; }
function Banner({ children }) { return <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{children}</div>; }
function display(value) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'number') return new Intl.NumberFormat('en-GH', { maximumFractionDigits: 2 }).format(value); if (typeof value === 'object') return JSON.stringify(value, null, 2); return String(value); }
function reportLabel(type) { return REPORTS.find(([key]) => key === type)?.[1] || type; }
function iso(date) { return date.toISOString().slice(0,10); }
function dateRange(shortcut) { const today = new Date(); const start = new Date(today); if (shortcut === 'all') return { dateFrom: '', dateTo: '' }; if (shortcut === '7days') start.setDate(today.getDate() - 6); if (shortcut === 'month') start.setDate(1); if (shortcut === 'year') { start.setMonth(0); start.setDate(1); } return { dateFrom: iso(shortcut === 'today' ? today : start), dateTo: iso(today) }; }
function saveBlob({ blob, filename }) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
