import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { getStaffDirectory, importStaffRecords } from '@/api/portalClient';
import { PageHeader, PrimaryButton, SecondaryButton } from '@/components/payroll/PageElements';
import { parseStaffFile, validateStaffRows } from '@/lib/staffImport';
import { toast } from '@/components/ui/use-toast';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</section>;
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const filters = [['all', 'All'], ['valid', 'Valid'], ['invalid', 'Invalid'], ['duplicate', 'Duplicate'], ['missing', 'Missing information']];

export default function UploadStaffEmails() {
  const navigate = useNavigate();
  const [existing, setExisting] = useState([]);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [errorCursor, setErrorCursor] = useState(-1);
  const [reason, setReason] = useState('Bulk staff email import');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cardRefs = useRef(new Map());

  useEffect(() => { getStaffDirectory().then(setExisting).catch((err) => setError(err.message)); }, []);
  const checked = useMemo(() => validateStaffRows(rows, existing), [rows, existing]);
  const indexedRows = useMemo(() => checked.map((row, index) => ({ row, index })), [checked]);
  const counts = useMemo(() => ({
    all: checked.length,
    valid: checked.filter((row) => row.isValid).length,
    invalid: checked.filter((row) => hasIssueType(row, 'Invalid')).length,
    duplicate: checked.filter((row) => hasIssueType(row, 'Duplicate')).length,
    missing: checked.filter((row) => hasIssueType(row, 'Missing')).length,
  }), [checked]);
  const visibleRows = indexedRows.filter(({ row }) => filter === 'all' || (filter === 'valid' ? row.isValid : hasIssueType(row, filterPrefix(filter))));
  const errorIndexes = indexedRows.filter(({ row }) => !row.isValid).map(({ index }) => index);

  useEffect(() => {
    setErrorCursor((current) => errorIndexes.length ? Math.min(current, errorIndexes.length - 1) : -1);
  }, [errorIndexes.length]);

  const chooseFile = async (selected) => {
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) { toast.warning('Choose an Excel or CSV file that is 5 MB or smaller.', { title: 'File is too large' }); return; }
    setBusy(true);
    try {
      const parsed = await parseStaffFile(selected);
      if (!parsed.length) throw new Error('The file contains no staff rows.');
      setFile(selected); setRows(parsed); setFilter('all'); setErrorCursor(-1); setError('');
      toast.info(`${parsed.length} rows are ready for validation and review.`, { title: 'File loaded' });
    } catch (err) { toast.error(err.message || 'Could not read this file.', { title: 'File could not be opened' }); }
    finally { setBusy(false); }
  };
  const updateRow = (index, key, value) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const clearFile = () => { setRows([]); setFile(null); setFilter('all'); setErrorCursor(-1); setError(''); cardRefs.current.clear(); };
  const jumpError = (direction) => {
    if (!errorIndexes.length) return;
    const next = errorCursor < 0 ? (direction > 0 ? 0 : errorIndexes.length - 1) : Math.max(0, Math.min(errorIndexes.length - 1, errorCursor + direction));
    setErrorCursor(next); setFilter('all');
    window.setTimeout(() => cardRefs.current.get(errorIndexes[next])?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const save = async () => {
    if (errorIndexes.length) { toast.warning('Fix every highlighted record before saving the import.', { title: 'Import needs attention' }); return; }
    if (!reason.trim()) { toast.warning('Enter a reason so this import can be recorded in the audit trail.', { title: 'Reason required' }); return; }
    setBusy(true);
    try {
      await importStaffRecords(checked.map(({ issues, isValid, rowNumber, ...record }) => record), file.name, reason);
      toast.success(`${checked.length} staff records were imported successfully.`, { title: 'Import complete' });
      navigate('/staff', { replace: true });
    } catch (err) { toast.error(err.message, { title: 'Staff import failed' }); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <PageHeader title="Upload Staff Emails" description="Import Excel or CSV records, review every issue, then save only after the file is clean." actions={<a href="/templates/bcb_staff_email_import_template.xlsx" download><SecondaryButton><Download className="h-4 w-4" /> Download Excel template</SecondaryButton></a>} />
    {error && <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}
    {!rows.length ? <FilePicker busy={busy} chooseFile={chooseFile} /> : <>
      <Card className="sticky top-20 z-20 border-primary/20 bg-card/95 p-3 shadow-lg backdrop-blur-xl sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate font-semibold">{file?.name}</p><p className="text-xs text-muted-foreground">{checked.length} imported records · {errorIndexes.length} need attention</p></div></div><div className="grid grid-cols-4 gap-2">{[['Valid', counts.valid, 'text-emerald-600'], ['Invalid', counts.invalid, counts.invalid ? 'text-red-600' : ''], ['Duplicate', counts.duplicate, counts.duplicate ? 'text-red-600' : ''], ['Missing', counts.missing, counts.missing ? 'text-amber-600' : '']].map(([label, value, tone]) => <div key={label} className="rounded-lg border border-border bg-background/70 px-2 py-1.5 text-center"><p className={`text-lg font-bold ${tone}`}>{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>)}</div></div>
        <div className="mt-3 grid grid-cols-2 gap-2 pb-1 sm:flex sm:overflow-x-auto">{filters.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`min-h-10 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold sm:rounded-full ${filter === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}>{label} <span className="opacity-75">{counts[key]}</span></button>)}</div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr),auto,auto]"><Label title="Reason for upload"><input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} required /></Label><div className="grid grid-cols-2 gap-2 md:self-end"><SecondaryButton disabled={!errorIndexes.length || errorCursor === 0} onClick={() => jumpError(-1)}><ChevronLeft className="h-4 w-4" /> Previous Error</SecondaryButton><SecondaryButton disabled={!errorIndexes.length || errorCursor === errorIndexes.length - 1} onClick={() => jumpError(1)}>Next Error <ChevronRight className="h-4 w-4" /></SecondaryButton></div><div className="grid grid-cols-2 gap-2 md:self-end"><SecondaryButton onClick={clearFile}>Change file</SecondaryButton><PrimaryButton onClick={save} disabled={busy || errorIndexes.length > 0}><Upload className="h-4 w-4" /> {busy ? 'Saving…' : `Save ${checked.length}`}</PrimaryButton></div></div>
        {errorIndexes.length > 0 && <p className="mt-2 text-xs font-semibold text-red-600">Saving is locked until every invalid, duplicate, or missing record is corrected.</p>}
      </Card>
      <div className="space-y-4">{visibleRows.map(({ row, index }) => <ImportStaffCard key={`${row.rowNumber}-${index}`} row={row} index={index} updateRow={updateRow} registerRef={(node) => { if (node) cardRefs.current.set(index, node); else cardRefs.current.delete(index); }} />)}{!visibleRows.length && <Card className="py-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><h2 className="mt-3 font-heading text-lg font-bold">No records in this filter</h2><p className="mt-1 text-sm text-muted-foreground">Choose another filter to continue reviewing the import.</p></Card>}</div>
    </>}
  </div>;
}

function FilePicker({ busy, chooseFile }) {
  return <div className="grid gap-5 lg:grid-cols-[1.2fr,.8fr]"><Card><button type="button" onClick={() => document.getElementById('staff-import-file')?.click()} className="flex min-h-64 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/25 bg-primary/[.03] p-6 text-center hover:bg-primary/[.06]"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Upload className="h-6 w-6" /></span><p className="mt-4 font-semibold">Choose a staff email file</p><p className="mt-1 text-sm text-muted-foreground">Excel (.xlsx) or CSV, up to 5 MB</p><span className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">{busy ? 'Reading file…' : 'Browse files'}</span></button><input id="staff-import-file" className="hidden" type="file" accept=".csv,.xlsx" onChange={(event) => chooseFile(event.target.files?.[0])} /></Card><Card><h2 className="font-heading text-lg font-bold">Required template columns</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{['Staff Name', 'Staff ID', 'Department', 'Position', 'Branch', 'Phone Number', 'Email Address', 'Employment Status'].map((item, index) => <div key={item} className="flex items-center gap-3 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>{item}</div>)}</div></Card></div>;
}

function ImportStaffCard({ row, index, updateRow, registerRef }) {
  const update = (key, value) => updateRow(index, key, value);
  return <Card className={`scroll-mt-80 ${row.isValid ? 'border-emerald-500/20' : 'border-red-500/30 bg-red-500/[.02]'}`}><article ref={registerRef}><div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Imported row {row.rowNumber}</p><h2 className="font-heading text-lg font-bold">{row.fullName || 'Unnamed staff record'}</h2></div>{row.isValid ? <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Ready to import</span> : <div className="flex max-w-xl flex-wrap gap-1.5">{row.issues.map((issue) => <span key={issue} className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-400">{issue}</span>)}</div>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><ImportField label="Staff name" issues={fieldIssues(row, 'fullName')}><input className={inputClass} value={row.fullName || ''} onChange={(event) => update('fullName', event.target.value)} /></ImportField><ImportField label="Staff ID" issues={fieldIssues(row, 'staffId')}><input className={inputClass} value={row.staffId || ''} onChange={(event) => update('staffId', event.target.value)} /></ImportField><ImportField label="Official email" issues={fieldIssues(row, 'email')}><input className={inputClass} type="email" value={row.email || ''} onChange={(event) => update('email', event.target.value)} /></ImportField><ImportField label="Department"><input className={inputClass} value={row.department || ''} onChange={(event) => update('department', event.target.value)} /></ImportField><ImportField label="Position"><input className={inputClass} value={row.position || ''} onChange={(event) => update('position', event.target.value)} /></ImportField><ImportField label="Branch"><input className={inputClass} value={row.branch || ''} onChange={(event) => update('branch', event.target.value)} /></ImportField><ImportField label="Phone number"><input className={inputClass} value={row.phone || ''} onChange={(event) => update('phone', event.target.value)} /></ImportField><ImportField label="Employment status" issues={fieldIssues(row, 'employmentStatus')}><select className={inputClass} value={row.employmentStatus || ''} onChange={(event) => update('employmentStatus', event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option>{!['active', 'inactive'].includes(row.employmentStatus) && <option value={row.employmentStatus}>{row.employmentStatus || 'Invalid status'}</option>}</select></ImportField></div></article></Card>;
}

function Label({ title, children }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</span>{children}</label>; }
function ImportField({ label, issues = [], children }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>{children}{issues.map((issue) => <span key={issue} className="mt-1 block text-xs font-semibold text-red-600">{issue}</span>)}</label>; }
function fieldIssues(row, key) { const groups = { fullName: ['Missing name'], staffId: ['Missing staff ID', 'Duplicate staff ID'], email: ['Missing email', 'Invalid email', 'Duplicate email'], employmentStatus: ['Invalid status'] }; return row.issues.filter((issue) => (groups[key] || []).includes(issue)); }
function hasIssueType(row, prefix) { return row.issues.some((issue) => issue.startsWith(prefix)); }
function filterPrefix(filter) { return ({ invalid: 'Invalid', duplicate: 'Duplicate', missing: 'Missing' })[filter] || ''; }
