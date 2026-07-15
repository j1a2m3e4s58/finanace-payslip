import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Download, Edit3, FileSpreadsheet, History, RefreshCcw, Upload, UserPlus, UserX, X } from 'lucide-react';
import { changeStaffRecordStatus, createStaffRecord, getPortalSettings, getStaffDirectory, getStaffRecordAuditLogs, importStaffRecords, updateStaffRecord } from '@/api/portalClient';
import { PageHeader, PrimaryButton, SearchBox, SecondaryButton, StatusBadge } from '@/components/payroll/PageElements';
import { useAuth } from '@/lib/AuthContext';
import { parseStaffFile, validateStaffRows } from '@/lib/staffImport';
import { toast } from '@/components/ui/use-toast';
import ConfirmActionDialog from '@/components/ui/confirm-action-dialog';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</section>;
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const Field = ({ label, children, className = '' }) => <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
const emptyForm = { fullName: '', staffId: '', department: '', position: '', branch: '', phone: '', email: '', employmentStatus: 'active', reason: '' };

function StaffFields({ form, setForm, includeReason = true, branches = [], departments = [] }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <>
    <Field label="Staff name"><input className={inputClass} value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required /></Field>
    <Field label="Staff ID"><input className={inputClass} value={form.staffId} onChange={(e) => update('staffId', e.target.value)} required /></Field>
    <Field label="Official email"><input className={inputClass} type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="name@bawjiasecommunitybank.com" required /></Field>
    <Field label="Phone number"><input className={inputClass} value={form.phone} onChange={(e) => update('phone', e.target.value)} /></Field>
    <Field label="Department"><select className={inputClass} value={form.department} onChange={(e) => update('department', e.target.value)} required><option value="">Select department</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="Position"><input className={inputClass} value={form.position} onChange={(e) => update('position', e.target.value)} required /></Field>
    <Field label="Branch"><select className={inputClass} value={form.branch} onChange={(e) => update('branch', e.target.value)} required><option value="">Select branch</option>{branches.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="Employment status"><select className={inputClass} value={form.employmentStatus} onChange={(e) => update('employmentStatus', e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
    {includeReason && <Field label="Reason for change" className="sm:col-span-2"><textarea className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" value={form.reason} onChange={(e) => update('reason', e.target.value)} required /></Field>}
  </>;
}

export function StaffDirectory() {
  const { can } = useAuth();
  const [records, setRecords] = useState([]);
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [department, setDepartment] = useState('all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState({ branches: [], departments: [] });
  const [statusAction, setStatusAction] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [staffRows, auditRows, settings] = await Promise.all([getStaffDirectory(), can('staff.manage') ? getStaffRecordAuditLogs() : Promise.resolve([]), getPortalSettings()]);
      setRecords(staffRows); setLogs(auditRows); setOrganization({ branches: settings.branches || [], departments: settings.departments || [] }); setError('');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const departments = [...new Set(records.map((item) => item.department).filter(Boolean))].sort();
  const rows = useMemo(() => records.filter((item) => {
    const matchesSearch = Object.values(item).join(' ').toLowerCase().includes(query.toLowerCase());
    return matchesSearch && (status === 'all' || item.employmentStatus === status) && (department === 'all' || item.department === department);
  }), [records, query, status, department]);

  const beginEdit = (record) => { setEditing(record); setForm({ ...record, reason: '' }); setError(''); };
  const saveEdit = async (event) => {
    event.preventDefault();
    try { await updateStaffRecord(editing.id, form); setEditing(null); toast.success('The staff record was updated and added to the audit trail.', { title: 'Staff record saved' }); await load(); }
    catch (err) { toast.error(err.message, { title: 'Staff record was not saved' }); }
  };
  const toggleStatus = (record) => {
    const next = record.employmentStatus === 'active' ? 'inactive' : 'active';
    setStatusAction({ record, next, reason: '' });
  };
  const confirmStatusChange = async () => {
    if (!statusAction?.reason.trim()) return;
    const { record, next, reason } = statusAction;
    try { await changeStaffRecordStatus(record.id, next, reason); setStatusAction(null); toast.warning(`${record.fullName} is now ${next}.`, { title: 'Employment status changed' }); await load(); }
    catch (err) { toast.error(err.message, { title: 'Status change failed' }); }
  };
  const actions = can('staff.manage') ? <><Link to="/staff/upload-emails"><SecondaryButton><Upload className="h-4 w-4" /> Upload emails</SecondaryButton></Link><Link to="/staff/new"><PrimaryButton><UserPlus className="h-4 w-4" /> Add staff</PrimaryButton></Link></> : null;
  return <div className="space-y-6">
    <PageHeader title="Staff Directory" description="Search and maintain payroll email records across the bank. Former staff remain available as inactive history." actions={actions} />
    {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}
    <Card><div className="mb-4 grid gap-3 lg:grid-cols-[1fr,180px,220px,auto]"><SearchBox value={query} onChange={setQuery} placeholder="Search name, ID, email or branch" /><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)}><option value="all">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select><p className="self-center text-sm text-muted-foreground">{rows.length} records</p></div>
      <div className="grid gap-3 md:hidden">{rows.map((person) => <StaffMobileCard key={person.id} person={person} canManage={can('staff.manage')} beginEdit={beginEdit} toggleStatus={toggleStatus} />)}{!loading && !rows.length && <p className="py-8 text-center text-sm text-muted-foreground">No staff records match these filters.</p>}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted-foreground"><tr><th className="pb-3">Staff member</th><th className="pb-3">Staff ID</th><th className="pb-3">Department / Position</th><th className="pb-3">Branch</th><th className="pb-3">Phone</th><th className="pb-3">Status</th><th className="pb-3 text-right">Actions</th></tr></thead><tbody>{rows.map((person) => <tr key={person.id} className="border-b border-border/60 last:border-0"><td className="py-3"><p className="font-semibold">{person.fullName}</p><p className="text-xs text-muted-foreground">{person.email}</p></td><td className="font-mono text-xs">{person.staffId}</td><td><p>{person.department}</p><p className="text-xs text-muted-foreground">{person.position}</p></td><td>{person.branch}</td><td>{person.phone || '—'}</td><td><StatusBadge status={person.employmentStatus === 'active' ? 'Active' : 'Inactive'} /></td><td><div className="flex justify-end gap-2"><Link to={`/salary-history?staff=${person.id}`}><button className="rounded-lg border border-border p-2 hover:bg-muted" aria-label={`Salary history for ${person.fullName}`}><History className="h-4 w-4 text-primary" /></button></Link>{can('staff.manage') && <><button onClick={() => beginEdit(person)} className="rounded-lg border border-border p-2 hover:bg-muted" aria-label={`Edit ${person.fullName}`}><Edit3 className="h-4 w-4" /></button><button onClick={() => toggleStatus(person)} className="rounded-lg border border-border p-2 hover:bg-muted" aria-label={`Change status for ${person.fullName}`}>{person.employmentStatus === 'active' ? <UserX className="h-4 w-4 text-red-600" /> : <RefreshCcw className="h-4 w-4 text-emerald-600" />}</button></>}</div></td></tr>)}</tbody></table>{!loading && !rows.length && <p className="py-10 text-center text-sm text-muted-foreground">No staff records match these filters.</p>}{loading && <p className="py-10 text-center text-sm text-muted-foreground">Loading staff records…</p>}</div>
    </Card>
    {can('staff.manage') && <Card><div className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">Recent staff email activity</h2></div><div className="mt-3 divide-y divide-border">{logs.slice(0, 6).map((log) => <div key={log.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><b>{log.action.replaceAll('_', ' ')}</b><p className="text-xs text-muted-foreground">{log.actorName} · {readAuditTarget(log.target)}</p></div><time className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</time></div>)}{!logs.length && <p className="py-4 text-sm text-muted-foreground">No staff changes recorded yet.</p>}</div></Card>}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-heading text-xl font-bold">Edit staff record</h2><p className="text-sm text-muted-foreground">Every saved change is recorded in the audit trail.</p></div><button onClick={() => setEditing(null)} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5" /></button></div><form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2"><StaffFields form={form} setForm={setForm} branches={organization.branches} departments={organization.departments} /><div className="flex gap-2 sm:col-span-2"><PrimaryButton type="submit">Save changes</PrimaryButton><SecondaryButton type="button" onClick={() => setEditing(null)}>Cancel</SecondaryButton></div></form></Card></div>}
    <ConfirmActionDialog open={Boolean(statusAction)} title={`${statusAction?.next === 'inactive' ? 'Deactivate' : 'Reactivate'} staff member?`} description={`${statusAction?.record?.fullName || 'This staff member'} will ${statusAction?.next === 'inactive' ? 'be removed from new payroll and payslip sending lists, while historical records remain available.' : 'be restored to active staff and become eligible for future payroll batches.'}`} confirmLabel={statusAction?.next === 'inactive' ? 'Deactivate staff' : 'Reactivate staff'} tone={statusAction?.next === 'inactive' ? 'danger' : 'warning'} inputLabel="Reason for change" inputType="textarea" inputPlaceholder="Enter the audit reason" required value={statusAction?.reason || ''} onValueChange={(reason) => setStatusAction((current) => current ? { ...current, reason } : current)} onClose={() => setStatusAction(null)} onConfirm={confirmStatusChange} />
  </div>;
}

function StaffMobileCard({ person, canManage, beginEdit, toggleStatus }) {
  return <article className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{person.fullName}</p><p className="truncate text-xs text-muted-foreground">{person.staffId} · {person.email}</p></div><StatusBadge status={person.employmentStatus === 'active' ? 'Active' : 'Inactive'} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="text-muted-foreground">Department</span><p className="font-semibold">{person.department || '—'}</p></div><div><span className="text-muted-foreground">Branch</span><p className="font-semibold">{person.branch || '—'}</p></div><div><span className="text-muted-foreground">Position</span><p>{person.position || '—'}</p></div><div><span className="text-muted-foreground">Phone</span><p>{person.phone || '—'}</p></div></div><div className="mt-4 flex gap-2"><Link className="flex-1" to={`/salary-history?staff=${person.id}`}><SecondaryButton className="min-h-10 w-full"><History className="h-4 w-4" /> History</SecondaryButton></Link>{canManage && <><SecondaryButton className="min-h-10 flex-1" onClick={() => beginEdit(person)}><Edit3 className="h-4 w-4" /> Edit</SecondaryButton><button onClick={() => toggleStatus(person)} className="min-h-10 rounded-lg border border-border px-3" aria-label={`Change status for ${person.fullName}`}>{person.employmentStatus === 'active' ? <UserX className="h-4 w-4 text-red-600" /> : <RefreshCcw className="h-4 w-4 text-emerald-600" />}</button></>}</div></article>;
}

function readAuditTarget(value) {
  try { const target = JSON.parse(value); return target.staffName || target.fileName || target.staffId || 'Staff records'; }
  catch { return value; }
}

export function AddNewStaff() {
  const navigate = useNavigate();
  const [addOrganization, setAddOrganization] = useState({ branches: [], departments: [] });
  const [form, setForm] = useState({ ...emptyForm, reason: 'New staff onboarding' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { getPortalSettings().then((settings) => setAddOrganization({ branches: settings.branches || [], departments: settings.departments || [] })).catch((err) => setError(err.message)); }, []);
  const submit = async (event) => { event.preventDefault(); setSaving(true); try { await createStaffRecord(form); toast.success(`${form.fullName} was added to the active staff directory.`, { title: 'Staff member added' }); navigate('/staff', { replace: true }); } catch (err) { toast.error(err.message, { title: 'Staff member was not added' }); } finally { setSaving(false); } };
  return <div className="space-y-6"><PageHeader title="Add New Staff" description="Add a new employee to the directory and payslip email list." />{error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}<Card className="max-w-4xl"><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><StaffFields form={form} setForm={setForm} branches={addOrganization.branches} departments={addOrganization.departments} /><div className="flex gap-2 sm:col-span-2"><PrimaryButton disabled={saving} type="submit"><UserPlus className="h-4 w-4" /> {saving ? 'Saving…' : 'Save staff record'}</PrimaryButton><Link to="/staff"><SecondaryButton type="button">Cancel</SecondaryButton></Link></div></form></Card></div>;
}

export function UploadStaffEmails() {
  const navigate = useNavigate();
  const [existing, setExisting] = useState([]);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [reason, setReason] = useState('Bulk staff email import');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { getStaffDirectory().then(setExisting).catch((err) => setError(err.message)); }, []);
  const checked = useMemo(() => validateStaffRows(rows, existing), [rows, existing]);
  const counts = useMemo(() => ({ valid: checked.filter((r) => r.isValid).length, invalidEmail: checked.filter((r) => r.issues.includes('Invalid email')).length, duplicateEmail: checked.filter((r) => r.issues.includes('Duplicate email')).length, duplicateId: checked.filter((r) => r.issues.includes('Duplicate staff ID')).length, missingName: checked.filter((r) => r.issues.includes('Missing name')).length, missingEmail: checked.filter((r) => r.issues.includes('Missing email')).length, missingId: checked.filter((r) => r.issues.includes('Missing staff ID')).length }), [checked]);
  const chooseFile = async (selected) => { if (!selected) return; if (selected.size > 5 * 1024 * 1024) { toast.warning('Choose an Excel or CSV file that is 5 MB or smaller.', { title: 'File is too large' }); return; } setBusy(true); try { const parsed = await parseStaffFile(selected); if (!parsed.length) throw new Error('The file contains no staff rows.'); setFile(selected); setRows(parsed); setError(''); toast.info(`${parsed.length} rows are ready for validation and review.`, { title: 'File loaded' }); } catch (err) { toast.error(err.message || 'Could not read this file.', { title: 'File could not be opened' }); } finally { setBusy(false); } };
  const updateRow = (index, key, value) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const save = async () => { if (checked.some((row) => !row.isValid)) { toast.warning('Fix every highlighted record before saving the import.', { title: 'Import needs attention' }); return; } if (!reason.trim()) { toast.warning('Enter a reason so this import can be recorded in the audit trail.', { title: 'Reason required' }); return; } setBusy(true); try { await importStaffRecords(checked.map(({ issues, isValid, rowNumber, ...record }) => record), file.name, reason); toast.success(`${checked.length} staff records were imported successfully.`, { title: 'Import complete' }); navigate('/staff', { replace: true }); } catch (err) { toast.error(err.message, { title: 'Staff import failed' }); } finally { setBusy(false); } };
  const summary = [['Valid records', counts.valid], ['Invalid emails', counts.invalidEmail], ['Duplicate emails', counts.duplicateEmail], ['Duplicate staff IDs', counts.duplicateId], ['Missing names', counts.missingName], ['Missing emails', counts.missingEmail], ['Missing staff IDs', counts.missingId]];
  return <div className="space-y-6"><PageHeader title="Upload Staff Emails" description="Import Excel or CSV records, review every issue, then save only after the file is clean." actions={<a href="/templates/bcb_staff_email_import_template.xlsx" download><SecondaryButton><Download className="h-4 w-4" /> Download Excel template</SecondaryButton></a>} />
    {error && <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}
    {!rows.length ? <div className="grid gap-5 lg:grid-cols-[1.2fr,.8fr]"><Card><button type="button" onClick={() => document.getElementById('staff-import-file')?.click()} className="flex min-h-64 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/25 bg-primary/[.03] p-6 text-center hover:bg-primary/[.06]"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Upload className="h-6 w-6" /></span><p className="mt-4 font-semibold">Choose a staff email file</p><p className="mt-1 text-sm text-muted-foreground">Excel (.xlsx) or CSV, up to 5 MB</p><span className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">{busy ? 'Reading file…' : 'Browse files'}</span></button><input id="staff-import-file" className="hidden" type="file" accept=".csv,.xlsx" onChange={(e) => chooseFile(e.target.files?.[0])} /></Card><Card><h2 className="font-heading text-lg font-bold">Required template columns</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{['Staff Name', 'Staff ID', 'Department', 'Position', 'Branch', 'Phone Number', 'Email Address', 'Employment Status'].map((item, index) => <div key={item} className="flex items-center gap-3 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>{item}</div>)}</div></Card></div> : <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{summary.map(([label, value], index) => <Card key={label} className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-bold ${index === 0 ? 'text-emerald-600' : value ? 'text-red-600' : ''}`}>{value}</p></Card>)}</div>
      <Card><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5 text-primary" /><div><p className="font-semibold">{file?.name}</p><p className="text-xs text-muted-foreground">Edit cells below to resolve validation issues.</p></div></div><SecondaryButton onClick={() => { setRows([]); setFile(null); setError(''); }}>Choose another file</SecondaryButton></div><div className="overflow-x-auto"><table className="w-full min-w-[1320px] text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted-foreground"><tr>{['Row', 'Staff Name', 'Staff ID', 'Department', 'Position', 'Branch', 'Phone', 'Email', 'Status', 'Validation'].map((item) => <th key={item} className="pb-3 pr-2">{item}</th>)}</tr></thead><tbody>{checked.map((row, index) => <tr key={`${row.rowNumber}-${index}`} className={`border-b border-border/60 ${row.isValid ? '' : 'bg-red-500/[.04]'}`}><td className="py-2">{row.rowNumber}</td>{['fullName','staffId','department','position','branch','phone','email'].map((key) => <td key={key} className="pr-2"><input aria-label={`${key} row ${row.rowNumber}`} className="h-9 w-full min-w-28 rounded-md border border-border bg-background px-2 text-xs" value={row[key] || ''} onChange={(e) => updateRow(index, key, e.target.value)} /></td>)}<td className="pr-2"><select className="h-9 rounded-md border border-border bg-background px-2 text-xs" value={row.employmentStatus} onChange={(e) => updateRow(index, 'employmentStatus', e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></td><td className="min-w-48">{row.isValid ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Valid</span> : <span className="text-xs font-semibold text-red-600">{row.issues.join(', ')}</span>}</td></tr>)}</tbody></table></div></Card>
      <Card><div className="grid gap-4 sm:grid-cols-[1fr,auto] sm:items-end"><Field label="Reason for upload"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required /></Field><PrimaryButton onClick={save} disabled={busy || checked.some((row) => !row.isValid)}><Upload className="h-4 w-4" /> {busy ? 'Saving…' : `Save ${checked.length} records`}</PrimaryButton></div>{checked.some((row) => !row.isValid) && <p className="mt-3 text-xs text-red-600">Saving is disabled until every invalid or duplicate row is corrected.</p>}</Card>
    </>}
  </div>;
}
