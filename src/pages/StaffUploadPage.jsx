import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { getPortalSettings, getStaffDirectory, importStaffRecords } from '@/api/portalClient';
import { PageHeader, PrimaryButton, SecondaryButton } from '@/components/payroll/PageElements';
import { buildStaffTemplateCsv, normalizeStaffImportSchema, parseStaffFile, validateStaffRows } from '@/lib/staffImport';
import { toast } from '@/components/ui/use-toast';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</section>;
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const filters = [['all', 'All'], ['valid', 'Valid'], ['invalid', 'Invalid'], ['duplicate', 'Duplicate'], ['missing', 'Missing information']];

export default function UploadStaffEmails() {
  const navigate = useNavigate();
  const [existing, setExisting] = useState([]);
  const [settings, setSettings] = useState(null);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [errorCursor, setErrorCursor] = useState(-1);
  const [reason, setReason] = useState('Bulk staff email import');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cardRefs = useRef(new Map());

  useEffect(() => {
    Promise.all([getStaffDirectory(), getPortalSettings()])
      .then(([records, portalSettings]) => { setExisting(records); setSettings(portalSettings); })
      .catch((err) => setError(err.message));
  }, []);
  const schema = useMemo(() => normalizeStaffImportSchema(settings?.staffImportSchema), [settings]);
  const emailDomain = settings?.emailDomain || 'bawjiasecommunitybank.com';
  const checked = useMemo(() => validateStaffRows(rows, existing, schema, emailDomain), [rows, existing, schema, emailDomain]);
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
    if (selected.size > schema.maxFileSizeMb * 1024 * 1024) {
      toast.warning(`Choose an Excel or CSV file that is ${schema.maxFileSizeMb} MB or smaller.`, { title: 'File is too large' });
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseStaffFile(selected, schema);
      if (!parsed.length) throw new Error('The file contains no staff rows.');
      if (parsed.length > schema.maxRows) throw new Error(`This file has ${parsed.length} staff rows. The configured limit is ${schema.maxRows}.`);
      setFile(selected); setRows(parsed); setFilter('all'); setErrorCursor(-1); setError('');
      toast.info(`${parsed.length} rows are ready for validation and review.`, { title: 'File loaded' });
    } catch (err) { toast.error(err.message || 'Could not read this file.', { title: 'File could not be opened' }); }
    finally { setBusy(false); }
  };
  const updateRow = (index, column, value) => setRows((current) => current.map((row, rowIndex) => {
    if (rowIndex !== index) return row;
    if (column.custom) return { ...row, customFields: { ...(row.customFields || {}), [column.key]: value } };
    return { ...row, [column.key]: value };
  }));
  const downloadTemplate = () => {
    const blob = new Blob([`\uFEFF${buildStaffTemplateCsv(schema, emailDomain)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `staff-import-template-v${schema.version}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
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
      const records = checked.map(toImportRecord);
      await importStaffRecords(records, file.name, reason, schema.version);
      toast.success(`${checked.length} staff records were imported successfully.`, { title: 'Import complete' });
      navigate('/staff', { replace: true });
    } catch (err) { toast.error(err.message, { title: 'Staff import failed' }); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <PageHeader title="Upload Staff Emails" description="Import Excel or CSV records, review every issue, then save only after the file is clean." actions={<SecondaryButton onClick={downloadTemplate} disabled={!settings}><Download className="h-4 w-4" /> Download CSV template</SecondaryButton>} />
    {error && <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}
    {!rows.length ? <FilePicker busy={busy} chooseFile={chooseFile} schema={schema} settingsReady={Boolean(settings)} /> : <>
      <Card className="sticky top-20 z-20 border-primary/20 bg-card/95 p-3 shadow-lg backdrop-blur-xl sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate font-semibold">{file?.name}</p><p className="text-xs text-muted-foreground">{checked.length} imported records · {errorIndexes.length} need attention</p></div></div><div className="grid grid-cols-4 gap-2">{[['Valid', counts.valid, 'text-emerald-600'], ['Invalid', counts.invalid, counts.invalid ? 'text-red-600' : ''], ['Duplicate', counts.duplicate, counts.duplicate ? 'text-red-600' : ''], ['Missing', counts.missing, counts.missing ? 'text-amber-600' : '']].map(([label, value, tone]) => <div key={label} className="rounded-lg border border-border bg-background/70 px-2 py-1.5 text-center"><p className={`text-lg font-bold ${tone}`}>{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>)}</div></div>
        <div className="mt-3 grid grid-cols-2 gap-2 pb-1 sm:flex sm:overflow-x-auto">{filters.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`min-h-10 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold sm:rounded-full ${filter === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}>{label} <span className="opacity-75">{counts[key]}</span></button>)}</div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr),auto,auto]"><Label title="Reason for upload"><input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} required /></Label><div className="grid grid-cols-2 gap-2 md:self-end"><SecondaryButton disabled={!errorIndexes.length || errorCursor === 0} onClick={() => jumpError(-1)}><ChevronLeft className="h-4 w-4" /> Previous Error</SecondaryButton><SecondaryButton disabled={!errorIndexes.length || errorCursor === errorIndexes.length - 1} onClick={() => jumpError(1)}>Next Error <ChevronRight className="h-4 w-4" /></SecondaryButton></div><div className="grid grid-cols-2 gap-2 md:self-end"><SecondaryButton onClick={clearFile}>Change file</SecondaryButton><PrimaryButton onClick={save} disabled={busy || errorIndexes.length > 0}><Upload className="h-4 w-4" /> {busy ? 'Saving…' : `Save ${checked.length}`}</PrimaryButton></div></div>
        {errorIndexes.length > 0 && <p className="mt-2 text-xs font-semibold text-red-600">Saving is locked until every invalid, duplicate, or missing record is corrected.</p>}
      </Card>
      <div className="space-y-4">{visibleRows.map(({ row, index }) => <ImportStaffCard key={`${row.rowNumber}-${index}`} row={row} index={index} updateRow={updateRow} columns={schema.columns} registerRef={(node) => { if (node) cardRefs.current.set(index, node); else cardRefs.current.delete(index); }} />)}{!visibleRows.length && <Card className="py-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><h2 className="mt-3 font-heading text-lg font-bold">No records in this filter</h2><p className="mt-1 text-sm text-muted-foreground">Choose another filter to continue reviewing the import.</p></Card>}</div>
    </>}
  </div>;
}

function FilePicker({ busy, chooseFile, schema, settingsReady }) {
  return <div className="grid gap-5 lg:grid-cols-[1.2fr,.8fr]"><Card><button type="button" disabled={busy || !settingsReady} onClick={() => document.getElementById('staff-import-file')?.click()} className="flex min-h-64 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/25 bg-primary/[.03] p-6 text-center hover:bg-primary/[.06] disabled:cursor-not-allowed disabled:opacity-60"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Upload className="h-6 w-6" /></span><p className="mt-4 font-semibold">Choose a staff email file</p><p className="mt-1 text-sm text-muted-foreground">Excel (.xlsx) or CSV, up to {schema.maxFileSizeMb} MB and {schema.maxRows.toLocaleString()} rows</p><span className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">{!settingsReady ? 'Loading settings…' : busy ? 'Reading file…' : 'Browse files'}</span></button><input id="staff-import-file" className="hidden" type="file" accept=".csv,.xlsx" onChange={(event) => chooseFile(event.target.files?.[0])} /></Card><Card><h2 className="font-heading text-lg font-bold">Configured template columns</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{schema.columns.map((column, index) => <div key={column.key} className="flex items-center gap-3 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span><span>{column.label}{column.required && <span className="ml-1 text-red-600">*</span>}</span></div>)}</div></Card></div>;
}

function ImportStaffCard({ row, index, updateRow, columns, registerRef }) {
  const update = (column, value) => updateRow(index, column, value);
  return <Card className={`scroll-mt-80 ${row.isValid ? 'border-emerald-500/20' : 'border-red-500/30 bg-red-500/[.02]'}`}><article ref={registerRef}><div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Imported row {row.rowNumber}</p><h2 className="font-heading text-lg font-bold">{row.fullName || 'Unnamed staff record'}</h2></div>{row.isValid ? <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Ready to import</span> : <div className="flex max-w-xl flex-wrap gap-1.5">{row.issues.map((issue) => <span key={issue} className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-400">{issue}</span>)}</div>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{columns.map((column) => <ImportField key={column.key} label={`${column.label}${column.required ? ' *' : ''}`} issues={row.issueFields?.[column.key] || []}>{renderImportControl(column, column.custom ? row.customFields?.[column.key] : row[column.key], (value) => update(column, value))}</ImportField>)}</div></article></Card>;
}

function renderImportControl(column, value, update) {
  if (column.key === 'employmentStatus') {
    const normalized = String(value || '').toLowerCase();
    return <select className={inputClass} value={normalized} onChange={(event) => update(event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option>{normalized && !['active', 'inactive'].includes(normalized) && <option value={normalized}>{value}</option>}</select>;
  }
  if (column.type === 'enum' && column.options?.length) return <select className={inputClass} value={value || ''} onChange={(event) => update(event.target.value)}><option value="">Select…</option>{column.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  return <input className={inputClass} type={column.type === 'email' ? 'email' : column.type === 'phone' ? 'tel' : 'text'} value={value || ''} onChange={(event) => update(event.target.value)} />;
}

function Label({ title, children }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</span>{children}</label>; }
function ImportField({ label, issues = [], children }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>{children}{issues.map((issue) => <span key={issue} className="mt-1 block text-xs font-semibold text-red-600">{issue}</span>)}</label>; }
function hasIssueType(row, prefix) { return row.issues.some((issue) => issue.startsWith(prefix)); }
function filterPrefix(filter) { return ({ invalid: 'Invalid', duplicate: 'Duplicate', missing: 'Missing' })[filter] || ''; }
function toImportRecord(row) {
  const record = { ...row };
  delete record.issues;
  delete record.issueFields;
  delete record.isValid;
  delete record.rowNumber;
  return record;
}
