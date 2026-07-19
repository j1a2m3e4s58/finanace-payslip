import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Calculator, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Cloud, CloudOff, Edit3, FileText, Loader2, Lock, MessageSquareWarning, Plus, Save, Send, X, XCircle } from 'lucide-react';
import { approvePayrollBatch, cancelPayrollBatch, createPayrollBatch, decidePayrollBatch, getPayrollBatch, getPayrollBatches, revisePayrollBatch, savePayrollDraft, submitPayrollBatch } from '@/api/portalClient';
import { PageHeader, PrimaryButton, SearchBox, SecondaryButton, StatusBadge } from '@/components/payroll/PageElements';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';
import ConfirmActionDialog from '@/components/ui/confirm-action-dialog';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</section>;
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const money = (value) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value || 0));

export const incomeFields = [
  ['basicSalary', 'Basic Salary'], ['supervisionAllowance', 'Supervision Allowance'], ['riskAllowance', 'Risk Allowance'],
  ['responsibilityAllowance', 'Responsibility Allowance'], ['entertainmentAllowance', 'Entertainment Allowance'],
  ['fuelTransportAllowance', 'Fuel / Transport'], ['rentUtilityAllowance', 'Rent / Utility'], ['otherAllowances', 'Other Allowances'],
];
export const deductionFields = [
  ['ssf', '5.5% SSF', true], ['esp', '4.5% ESP', true], ['pf', '4.5% PF', true],
  ['payeIncomeTax', 'P.A.Y.E Income Tax'], ['staffWelfare', 'Staff Welfare'], ['icuDues', 'ICU Dues'], ['loans', 'Loans'], ['otherDeductions', 'Other Deductions'],
];
const manualFields = [...incomeFields.map(([key]) => key), ...deductionFields.filter(([, , automatic]) => !automatic).map(([key]) => key)];
const trackedFields = [...manualFields, 'ssf', 'esp', 'pf', 'totalIncome', 'totalDeductions', 'netSalary', 'employerSsf', 'employerPf'];
const payrollPageSize = 8;

export function calculateEntry(entry) {
  const next = { ...entry };
  const basic = Number(next.basicSalary || 0);
  next.ssf = round(basic * 0.055);
  next.esp = round(basic * 0.045);
  next.pf = round(basic * 0.045);
  next.employerSsf = round(basic * 0.13);
  next.employerPf = round(basic * 0.05);
  next.totalIncome = round(incomeFields.reduce((sum, [key]) => sum + Number(next[key] || 0), 0));
  next.totalDeductions = round(deductionFields.reduce((sum, [key]) => sum + Number(next[key] || 0), 0));
  next.netSalary = round(next.totalIncome - next.totalDeductions);
  return next;
}

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function entryIssues(entry) {
  const issues = [];
  if (manualFields.some((field) => entry[field] === null || entry[field] === undefined || entry[field] === '')) issues.push('Empty salary fields');
  if (!entry.email) issues.push('Missing email');
  if (Number(entry.basicSalary || 0) <= 0) issues.push('Basic salary required');
  if (manualFields.some((field) => Number(entry[field] || 0) < 0)) issues.push('Negative amount');
  if (manualFields.filter((field) => field !== 'basicSalary').some((field) => Number(entry[field] || 0) > 250000) || Number(entry.basicSalary || 0) > 1000000) issues.push('Unusually large figure');
  if (Number(entry.netSalary || 0) < 0) issues.push('Deductions exceed income');
  return issues;
}

export function PayrollBatches() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ period: new Date().toISOString().slice(0, 7), name: '', sourceBatchId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revisionAction, setRevisionAction] = useState(null);
  const load = () => getPayrollBatches().then(setBatches).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!form.period) return;
    const date = new Date(`${form.period}-01T00:00:00`);
    setForm((current) => ({ ...current, name: `${date.toLocaleString('en-GB', { month: 'long', year: 'numeric' })} Payroll` }));
  }, [form.period]);
  const create = async (event) => { event.preventDefault(); setBusy(true); try { const batch = await createPayrollBatch(form); toast.success(`${batch.name} is ready for salary entry.`, { title: 'Payroll batch created' }); navigate(`/payroll/entry?batch=${batch.id}`); } catch (err) { toast.error(err.message, { title: 'Payroll batch was not created' }); } finally { setBusy(false); } };
  const revise = async () => { if (!revisionAction?.reason.trim()) return; const { batch, reason } = revisionAction; setBusy(true); try { const revision = await revisePayrollBatch(batch.id, reason); setRevisionAction(null); toast.warning('A new correction version was created; the original remains unchanged.', { title: 'Payroll revision created' }); navigate(`/payroll/entry?batch=${revision.id}`); } catch (err) { toast.error(err.message, { title: 'Revision was not created' }); } finally { setBusy(false); } };
  const copySources = batches.filter((batch) => batch.status !== 'cancelled' && batch.period < form.period);
  return <div className="space-y-6"><PageHeader title="Payroll Batches" description="Create and track each monthly payroll from draft preparation through approval." actions={can('payroll.prepare') ? <PrimaryButton onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create payroll batch</PrimaryButton> : null} />
    {error && <ErrorBanner text={error} />}
    <div className="grid gap-4">{batches.map((batch) => <Card key={batch.id} className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="min-w-56"><p className="text-xs font-bold uppercase text-muted-foreground">Payroll period · Version {batch.version || 1}</p><h2 className="font-heading text-xl font-bold">{batch.name}</h2><p className="text-xs text-muted-foreground">Prepared by {batch.createdBy}{batch.sourceBatchName ? ` · Copied from ${batch.sourceBatchName}` : ''}</p>{batch.salaryChangeCount > 0 && <p className="mt-1 text-xs font-semibold text-amber-700">{batch.salaryChangeCount} tracked salary changes</p>}{batch.rejectionReason && <p className="mt-2 max-w-sm rounded-md bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-700">Returned: {batch.rejectionReason}</p>}</div><div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4"><Summary label="Staff" value={batch.summary?.staffCount || 0} /><Summary label="Income" value={money(batch.summary?.totalIncome)} /><Summary label="Deductions" value={money(batch.summary?.totalDeductions)} /><Summary label="Net salary" value={money(batch.summary?.totalNetSalary)} accent /></div><div className="flex flex-wrap items-center justify-end gap-2"><StatusBadge status={batchStatus(batch.status)} />{['draft', 'rejected', 'corrected'].includes(batch.status) && can('payroll.prepare') && <Link to={`/payroll/entry?batch=${batch.id}`}><SecondaryButton><Edit3 className="h-4 w-4" /> {batch.status === 'draft' ? 'Edit draft' : 'Correct batch'}</SecondaryButton></Link>}{['approved', 'generated', 'partially_sent', 'sent'].includes(batch.status) && can('payslips.preview') && <Link to={`/payslips/preview?batch=${batch.id}`}><SecondaryButton><FileText className="h-4 w-4" /> Payslips</SecondaryButton></Link>}{batch.status === 'submitted' && can('payroll.approve') && <Link to={`/payroll/approvals?batch=${batch.id}`}><PrimaryButton><ClipboardCheck className="h-4 w-4" /> Review</PrimaryButton></Link>}{['sent', 'partially_sent'].includes(batch.status) && can('payroll.prepare') && <SecondaryButton disabled={busy} onClick={() => setRevisionAction({ batch, reason: '' })}><Edit3 className="h-4 w-4" /> Create revision</SecondaryButton>}{!['draft', 'rejected', 'corrected'].includes(batch.status) && <Link to={`/payroll/entry?batch=${batch.id}`}><SecondaryButton>View</SecondaryButton></Link>}</div></Card>)}{!batches.length && <Card className="py-12 text-center"><Calculator className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 font-heading text-lg font-bold">No payroll batches yet</h2><p className="mt-1 text-sm text-muted-foreground">Create the first monthly batch to begin salary entry.</p></Card>}</div>
    {creating && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="w-full max-w-lg"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-heading text-xl font-bold">Create payroll batch</h2><p className="text-sm text-muted-foreground">Only active staff will be included.</p></div><button onClick={() => setCreating(false)} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5" /></button></div><form onSubmit={create} className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">Payroll month</span><input className={inputClass} type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value, sourceBatchId: '' })} required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">Batch name</span><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">Copy salary details from</span><select className={inputClass} value={form.sourceBatchId} onChange={(e) => setForm({ ...form, sourceBatchId: e.target.value })}><option value="">Start with empty salary fields</option>{copySources.map((batch) => <option key={batch.id} value={batch.id}>{batch.name} · {batchStatus(batch.status)}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">Copied records become the comparison baseline; the previous payroll remains unchanged.</p></label><div className="flex gap-2"><PrimaryButton disabled={busy} type="submit">{busy ? 'Creating…' : form.sourceBatchId ? 'Copy and create payroll' : 'Create and enter salaries'}</PrimaryButton><SecondaryButton type="button" onClick={() => setCreating(false)}>Cancel</SecondaryButton></div></form></Card></div>}
    <ConfirmActionDialog open={Boolean(revisionAction)} title="Create a revised payslip version?" description="The original sent payslips will remain permanent. A separate correction version will be created and must pass approval before it can be sent." confirmLabel="Create revision" inputLabel="Reason for revision" inputType="textarea" inputPlaceholder="Explain why this correction is required" required value={revisionAction?.reason || ''} onValueChange={(reason) => setRevisionAction((current) => current ? { ...current, reason } : current)} busy={busy} onClose={() => setRevisionAction(null)} onConfirm={revise} />
  </div>;
}

export function PayrollApprovals() {
  const [params] = useSearchParams();
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState(params.get('batch') || '');
  const [decision, setDecision] = useState(null);
  const [comments, setComments] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const rows = await getPayrollBatches();
    setBatches(rows);
    setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows.find((row) => row.status === 'submitted')?.id || rows[0]?.id || '');
  };
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);
  const batch = batches.find((item) => item.id === selectedId);
  const review = batch?.reviewSummary || {};
  const act = async () => {
    if (!batch || !decision) return;
    if (decision !== 'approve' && !comments.trim()) { toast.warning('Enter a reason before returning this payroll.', { title: 'Reason required' }); return; }
    setBusy(true);
    try {
      if (decision === 'approve') await approvePayrollBatch(batch.id, comments.trim());
      else await decidePayrollBatch(batch.id, decision, comments.trim());
      toast.success(decision === 'approve' ? 'The payroll is approved for PDF generation and sending.' : 'The payroll was returned to Finance with your comments.', { title: decision === 'approve' ? 'Payroll approved' : 'Decision recorded' });
      setDecision(null); setComments(''); setError(''); await load();
    } catch (err) { toast.error(err.message, { title: 'Decision was not saved' }); } finally { setBusy(false); }
  };
  const metrics = [
    ['Total staff', review.staffCount || 0], ['Gross salary', money(review.totalIncome)],
    ['Deductions', money(review.totalDeductions)], ['Net salary', money(review.totalNetSalary)],
    ['Salary changes', review.salaryChangeCount || 0], ['Missing emails', review.missingEmailCount || 0],
    ['Invalid emails', review.invalidEmailCount || 0], ['Inactive staff', review.inactiveStaffCount || 0],
    ['Suspicious figures', review.suspiciousFigureCount || 0],
  ];
  return <div className="space-y-6"><PageHeader title="Payroll Approval" description="Review payroll totals, staff exceptions, and change evidence before payslips can be generated or sent." />
    {error && <ErrorBanner text={error} />}
    <Card><label className="text-xs font-bold uppercase text-muted-foreground">Payroll batch</label><select className={`${inputClass} mt-2`} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Select payroll</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.name} · Version {item.version || 1} · {batchStatus(item.status)}</option>)}</select></Card>
    {batch && <><div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="font-heading text-xl font-bold">{batch.name}</h2><StatusBadge status={batchStatus(batch.status)} /></div><p className="mt-1 text-sm text-muted-foreground">Submitted by {batch.submittedBy || 'Not submitted'}{batch.submittedAt ? ` on ${new Date(batch.submittedAt).toLocaleString()}` : ''}</p></div>{batch.status === 'submitted' && <div className="flex flex-wrap gap-2"><button onClick={() => { setDecision('reject'); setComments(''); }} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/10">Reject</button><SecondaryButton onClick={() => { setDecision('request_correction'); setComments(''); }}><MessageSquareWarning className="h-4 w-4" /> Request Correction</SecondaryButton><PrimaryButton onClick={() => { setDecision('approve'); setComments(''); }}><CheckCircle2 className="h-4 w-4" /> Approve</PrimaryButton></div>}</div>
      {batch.rejectionReason && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800"><b>Return reason:</b> {batch.rejectionReason}</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{metrics.map(([label, value], index) => <Card key={label} className={index >= 4 && Number(value) > 0 ? 'border-amber-500/40 bg-amber-500/[.04]' : ''}><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></Card>)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><ReviewList title="Staff with salary changes" rows={review.salaryChanges} render={(row) => `${row.changeCount} changed fields · ${row.reason || 'No reason recorded'}`} /><ReviewList title="Suspicious salary figures" rows={review.suspiciousFigures} warning render={(row) => row.issues?.join(', ')} /><ReviewList title="Missing or invalid emails" rows={[...(review.missingEmails || []), ...(review.invalidEmails || [])]} warning render={(row) => row.email || 'No email address'} /><ReviewList title="Inactive staff in batch" rows={review.inactiveStaff} warning render={() => 'Staff directory status is inactive'} /></div>
      <Card><div className="mb-4 flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">Approval history</h2></div><div className="space-y-0">{(batch.approvalHistory || []).slice().reverse().map((event) => <div key={event.id} className="flex gap-3 border-b border-border/60 py-3 last:border-0"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold capitalize">{String(event.action).replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{event.actorName} · {event.actorRole} · {new Date(event.timestamp).toLocaleString()}</p>{event.comments && <p className="mt-1 text-sm">{event.comments}</p>}</div></div>)}{!batch.approvalHistory?.length && <p className="text-sm text-muted-foreground">No approval activity recorded.</p>}</div></Card></>}
    {!batch && <Card className="py-12 text-center"><ClipboardCheck className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 text-sm text-muted-foreground">No payroll batch is available for review.</p></Card>}
    {decision && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="w-full max-w-lg"><h2 className="font-heading text-xl font-bold">{decision === 'approve' ? 'Approve payroll' : decision === 'reject' ? 'Reject payroll' : 'Request correction'}</h2><p className="mt-1 text-sm text-muted-foreground">{decision === 'approve' ? 'Approval unlocks PDF generation and payslip sending.' : 'Finance will see this reason and can correct and resubmit the batch.'}</p><textarea autoFocus className="mt-4 min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" value={comments} onChange={(event) => setComments(event.target.value)} placeholder={decision === 'approve' ? 'Optional approval comments' : 'Reason is required'} /><div className="mt-4 flex justify-end gap-2"><SecondaryButton disabled={busy} onClick={() => setDecision(null)}>Cancel</SecondaryButton><PrimaryButton disabled={busy || (decision !== 'approve' && !comments.trim())} onClick={act}>{busy ? 'Saving…' : 'Confirm decision'}</PrimaryButton></div></Card></div>}
  </div>;
}

function ReviewList({ title, rows = [], render, warning = false }) {
  return <Card><div className="mb-3 flex items-center gap-2">{warning ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}<h3 className="font-heading font-bold">{title}</h3><span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{rows.length}</span></div>{rows.length ? <div className="max-h-56 space-y-2 overflow-y-auto">{rows.map((row, index) => <div key={`${row.staffRecordId}-${index}`} className="rounded-lg border border-border/70 p-3"><p className="text-sm font-semibold">{row.fullName} <span className="font-normal text-muted-foreground">· {row.staffId}</span></p><p className="mt-1 text-xs text-muted-foreground">{render(row)}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No exceptions found.</p>}</Card>;
}

export function PayrollEntry() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const batchId = params.get('batch');
  const [batch, setBatch] = useState(null);
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('all');
  const [branch, setBranch] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedStaffId, setExpandedStaffId] = useState(null);
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState({ kind: 'saved', at: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState(null);
  const entriesRef = useRef([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => {
    if (!batchId) return;
    getPayrollBatch(batchId).then((result) => {
      const loaded = result.entries.map(calculateEntry);
      setBatch(result);
      setEntries(loaded);
      entriesRef.current = loaded;
      setExpandedStaffId(null);
      setDirty(false);
      setSaveState({ kind: 'saved', at: result.updatedAt || null });
    }).catch((err) => setError(err.message));
  }, [batchId]);
  const editable = ['draft', 'rejected', 'corrected'].includes(batch?.status) && can('payroll.prepare');
  const departments = [...new Set(entries.map((item) => item.department).filter(Boolean))].sort();
  const branches = [...new Set(entries.map((item) => item.branch).filter(Boolean))].sort();
  const baselineByStaff = useMemo(() => Object.fromEntries((batch?.baselineEntries || []).map((entry) => [entry.staffRecordId, entry])), [batch]);
  const entryRows = useMemo(() => entries.map((entry) => {
    const changed = entryHasChanges(entry, baselineByStaff[entry.staffRecordId]);
    const issues = entryIssues(entry);
    if (changed && !String(entry.changeReason || '').trim()) issues.push('Reason for change required');
    return { entry, changed, issues, fieldIssues: payrollFieldIssues(entry) };
  }), [entries, baselineByStaff]);
  const invalid = entryRows.filter((item) => item.issues.length);
  const completed = entryRows.length - invalid.length;
  const filtered = useMemo(() => entryRows.filter(({ entry, changed, issues }) => {
    const matchesText = Object.values(entry).join(' ').toLowerCase().includes(query.toLowerCase());
    const matchesOrganization = (department === 'all' || entry.department === department) && (branch === 'all' || entry.branch === branch);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'attention' && issues.length > 0) || (statusFilter === 'changed' && changed) || (statusFilter === 'ready' && issues.length === 0);
    return matchesText && matchesOrganization && matchesStatus;
  }), [entryRows, query, department, branch, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / payrollPageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * payrollPageSize;
  const pagedEntries = filtered.slice(pageStart, pageStart + payrollPageSize);
  useEffect(() => { setPage(1); setExpandedStaffId(null); }, [query, department, branch, statusFilter]);
  const totals = useMemo(() => entries.reduce((sum, entry) => ({ income: sum.income + Number(entry.totalIncome || 0), deductions: sum.deductions + Number(entry.totalDeductions || 0), net: sum.net + Number(entry.netSalary || 0), employerSsf: sum.employerSsf + Number(entry.employerSsf || 0), employerPf: sum.employerPf + Number(entry.employerPf || 0) }), { income: 0, deductions: 0, net: 0, employerSsf: 0, employerPf: 0 }), [entries]);
  const update = useCallback((staffRecordId, field, raw) => {
    setEntries((current) => current.map((entry) => entry.staffRecordId === staffRecordId ? calculateEntry({ ...entry, [field]: field === 'changeReason' ? raw : raw === '' ? null : Number(raw) }) : entry));
    setDirty(true);
    setSaveState({ kind: 'unsaved', at: null });
  }, []);
  const persistDraft = useCallback(async (payload, { quiet = false, background = false } = {}) => {
    const payloadSignature = JSON.stringify(payload);
    if (!background) setBusy(true);
    setSaveState({ kind: 'saving', at: null });
    try {
      const saved = await savePayrollDraft(batchId, payload);
      setBatch(saved);
      setError('');
      if (JSON.stringify(entriesRef.current) === payloadSignature) {
        const normalized = saved.entries.map(calculateEntry);
        setEntries(normalized);
        entriesRef.current = normalized;
        setDirty(false);
        setSaveState({ kind: 'saved', at: saved.updatedAt || Date.now() });
      } else {
        setSaveState({ kind: 'unsaved', at: null });
      }
      if (!quiet) toast.success('All current salary entries were saved safely.', { title: 'Payroll draft saved' });
      return saved;
    } catch (err) {
      setSaveState({ kind: 'error', at: null });
      if (!background) toast.error(err.message, { title: 'Payroll draft was not saved' });
      return null;
    } finally {
      if (!background) setBusy(false);
    }
  }, [batchId]);
  const autoSaveBlocked = useMemo(() => entryRows.some(({ entry, changed }) => !entryCanBeSaved(entry, changed)), [entryRows]);
  useEffect(() => {
    if (!editable || !dirty || !entries.length) return undefined;
    if (autoSaveBlocked) {
      setSaveState({ kind: 'blocked', at: null });
      return undefined;
    }
    const timer = window.setTimeout(() => persistDraft(entriesRef.current, { quiet: true, background: true }), 2500);
    return () => window.clearTimeout(timer);
  }, [entries, editable, dirty, autoSaveBlocked, persistDraft]);
  const save = (quiet = false) => persistDraft(entriesRef.current, { quiet, background: false });
  const activeFilteredIndex = filtered.findIndex(({ entry }) => entry.staffRecordId === expandedStaffId);
  const moveStaff = (direction) => {
    const targetIndex = activeFilteredIndex < 0 ? 0 : activeFilteredIndex + direction;
    if (targetIndex < 0 || targetIndex >= filtered.length) return;
    const target = filtered[targetIndex].entry.staffRecordId;
    setPage(Math.floor(targetIndex / payrollPageSize) + 1);
    setExpandedStaffId(target);
  };
  const submit = async () => { if (invalid.length) { toast.warning(`Resolve validation issues for ${invalid.length} staff member${invalid.length === 1 ? '' : 's'} before submission.`, { title: 'Payroll needs attention' }); return; } const saved = await save(true); if (!saved) return; setBusy(true); try { const submitted = await submitPayrollBatch(batchId); setBatch(submitted); toast.success('The payroll is locked and waiting for an authorized approver.', { title: 'Payroll submitted' }); } catch (err) { toast.error(err.message, { title: 'Payroll was not submitted' }); } finally { setBusy(false); } };
  const cancel = async () => { if (!cancelReason?.trim()) return; setBusy(true); try { await cancelPayrollBatch(batchId, cancelReason); setCancelReason(null); toast.warning('The payroll batch was cancelled and retained in the audit history.', { title: 'Payroll cancelled' }); navigate('/payroll/batches'); } catch (err) { toast.error(err.message, { title: 'Payroll was not cancelled' }); } finally { setBusy(false); } };
  if (!batchId) return <div className="space-y-6"><PageHeader title="Payroll Entry" description="Open a draft payroll batch to enter salary details." /><Card className="text-center"><p className="text-sm text-muted-foreground">No payroll batch was selected.</p><Link to="/payroll/batches"><PrimaryButton className="mt-4">Go to payroll batches</PrimaryButton></Link></Card></div>;
  if (!batch) return <div className="space-y-6"><PageHeader title="Payroll Entry" description="Loading payroll batch…" />{error && <ErrorBanner text={error} />}</div>;
  return <div className="space-y-6"><PageHeader title={batch.name} description={editable ? `Enter salary figures directly.${batch.sourceBatchName ? ` Copied from ${batch.sourceBatchName}; only explain staff whose values changed.` : ''}` : 'This payroll is read-only because it is in review or has been finalized.'} actions={<><SaveStateIndicator state={saveState} /><StatusBadge status={batchStatus(batch.status)} /><Link to="/payroll/batches"><SecondaryButton>Back to batches</SecondaryButton></Link></>} />
    {batch.rejectionReason && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800"><b>{batch.decisionType === 'request_correction' ? 'Correction requested' : 'Rejected'} by {batch.rejectedBy}:</b> {batch.rejectionReason}</div>}
    {error && <ErrorBanner text={error} />}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Total Income" value={money(totals.income)} /><Metric label="Total Deductions" value={money(totals.deductions)} /><Metric label="Net Salary" value={money(totals.net)} accent /><Metric label="Employer SSF" value={money(totals.employerSsf)} /><Metric label="Employer PF" value={money(totals.employerPf)} /></div>
    <Card>
      <div className="mb-5 rounded-xl border border-primary/15 bg-primary/[.035] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">Payroll completion</p><p className="text-xs text-muted-foreground">{completed} of {entryRows.length} staff completed</p></div><p className="text-2xl font-bold text-primary">{entryRows.length ? Math.round((completed / entryRows.length) * 100) : 0}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${entryRows.length ? (completed / entryRows.length) * 100 : 0}%` }} /></div></div>
      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr,220px,220px,auto]"><SearchBox value={query} onChange={setQuery} placeholder="Search staff name, ID or email" /><select className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)}><option value="all">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select><select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="all">All branches</option>{branches.map((item) => <option key={item}>{item}</option>)}</select><p className="self-center text-sm text-muted-foreground">{filtered.length} staff</p></div>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter staff by payroll status">{[['all', 'All', entryRows.length], ['attention', 'Needs Attention', invalid.length], ['changed', 'Salary Changed', entryRows.filter((item) => item.changed).length], ['ready', 'Ready', completed]].map(([value, label, count]) => <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${statusFilter === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/40'}`}>{label} <span className={`ml-1 rounded-full px-1.5 py-0.5 ${statusFilter === value ? 'bg-white/20' : 'bg-muted'}`}>{count}</span></button>)}</div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs"><span className="font-bold text-emerald-700 dark:text-emerald-400">Income fields</span><span className="font-bold text-red-700 dark:text-red-400">Deduction fields</span><span className="inline-flex items-center gap-1 font-bold text-blue-700 dark:text-blue-400"><Lock className="h-3 w-3" /> Automatic calculations</span></div>
      <div className="space-y-3">{pagedEntries.map(({ entry, changed, issues, fieldIssues }) => <PayrollStaffCard key={entry.staffRecordId} entry={entry} editable={editable} update={update} changed={changed} issues={issues} fieldIssues={fieldIssues} expanded={expandedStaffId === entry.staffRecordId} onToggle={() => setExpandedStaffId((current) => current === entry.staffRecordId ? null : entry.staffRecordId)} />)}{!pagedEntries.length && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No staff match the selected search and filters.</div>}</div>
      {filtered.length > payrollPageSize && <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Showing {pageStart + 1}-{Math.min(pageStart + payrollPageSize, filtered.length)} of {filtered.length} staff</p><div className="flex items-center gap-2"><SecondaryButton disabled={safePage <= 1} onClick={() => { setPage((current) => Math.max(1, current - 1)); setExpandedStaffId(null); }}><ChevronLeft className="h-4 w-4" /> Previous page</SecondaryButton><span className="min-w-20 text-center text-xs font-semibold">Page {safePage} of {pageCount}</span><SecondaryButton disabled={safePage >= pageCount} onClick={() => { setPage((current) => Math.min(pageCount, current + 1)); setExpandedStaffId(null); }}>Next page <ChevronRight className="h-4 w-4" /></SecondaryButton></div></div>}
    </Card>
    {editable && <div className="sticky bottom-3 z-20 rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur"><div className="flex flex-col gap-3 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><SaveStateIndicator state={saveState} />{invalid.length ? <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-red-600"><AlertCircle className="h-4 w-4 shrink-0" />{invalid.length} staff record{invalid.length === 1 ? '' : 's'} require attention</p> : <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" />All payroll entries are ready for submission</p>}</div><div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end"><SecondaryButton disabled={activeFilteredIndex <= 0} onClick={() => moveStaff(-1)}><ChevronLeft className="h-4 w-4" /> Previous Staff</SecondaryButton><SecondaryButton disabled={busy || !dirty || autoSaveBlocked || saveState.kind === 'saving'} onClick={() => save(false)}><Save className="h-4 w-4" /> Save Draft</SecondaryButton><SecondaryButton disabled={activeFilteredIndex < 0 || activeFilteredIndex >= filtered.length - 1} onClick={() => moveStaff(1)}>Next Staff <ChevronRight className="h-4 w-4" /></SecondaryButton><PrimaryButton disabled={busy || invalid.length > 0 || saveState.kind === 'saving'} onClick={submit}><Send className="h-4 w-4" /> Submit</PrimaryButton><button disabled={busy} onClick={() => setCancelReason('')} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-500/10 sm:col-auto"><XCircle className="h-4 w-4" /> Cancel Batch</button></div></div></div>}
    <ConfirmActionDialog open={cancelReason !== null} title="Cancel this payroll batch?" description="The batch will be locked as cancelled and retained permanently in the audit history. It will not be deleted." confirmLabel="Cancel payroll batch" tone="danger" inputLabel="Reason for cancellation" inputType="textarea" inputPlaceholder="Enter the required audit reason" required value={cancelReason || ''} onValueChange={setCancelReason} busy={busy} onClose={() => setCancelReason(null)} onConfirm={cancel} />
  </div>;
}

function PayrollStaffCard({ entry, editable, update, changed, issues, fieldIssues, expanded, onToggle }) {
  const status = issues.length ? 'Needs Attention' : changed ? 'Changed' : 'Ready';
  return <article id={`payroll-staff-${entry.staffRecordId}`} className={`scroll-mt-24 overflow-clip rounded-xl border bg-background ${issues.length ? 'border-red-500/40' : expanded ? 'border-primary/35' : 'border-border'}`}>
    <header className={expanded ? 'border-b border-border bg-background' : ''}><button type="button" aria-expanded={expanded} onClick={onToggle} className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-semibold">{entry.fullName}</p><p className="truncate text-xs text-muted-foreground">{entry.staffId} · {entry.email || 'No email'}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><div className="text-right"><p className="text-[10px] font-bold uppercase text-muted-foreground">Net salary</p><p className="font-bold text-primary">{money(entry.netSalary)}</p></div><StatusBadge status={status} /><ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} /></div></button></header>
    {expanded && <div className="p-4"><PayrollFieldGroup title="Income" tone="emerald" fields={incomeFields} entry={entry} editable={editable} update={update} fieldIssues={fieldIssues} /><PayrollFieldGroup title="Deductions" tone="red" fields={deductionFields} entry={entry} editable={editable} update={update} fieldIssues={fieldIssues} /><div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/[.06] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-blue-700 dark:text-blue-400"><Lock className="h-4 w-4" /> Automatic totals</div><div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><LockedAmount label="Total income" value={entry.totalIncome} /><LockedAmount label="Total deductions" value={entry.totalDeductions} /><LockedAmount label="Net salary" value={entry.netSalary} strong /><LockedAmount label="Employer SSF" value={entry.employerSsf} /><LockedAmount label="Employer PF" value={entry.employerPf} /></div></div>{changed && <label className="mt-4 block text-xs font-semibold">Reason for salary change<input className={`mt-1 h-10 w-full rounded-lg border bg-background px-3 ${!entry.changeReason?.trim() ? 'border-red-500' : 'border-border'}`} value={entry.changeReason || ''} disabled={!editable} placeholder="Explain the salary, allowance, tax, or deduction change" onChange={(event) => update(entry.staffRecordId, 'changeReason', event.target.value)} />{!entry.changeReason?.trim() && <span className="mt-1 block text-[11px] font-semibold text-red-600">A reason is required before this record can be saved.</span>}</label>}<div className={`mt-4 rounded-lg border p-3 text-xs ${issues.length ? 'border-red-500/25 bg-red-500/[.05]' : 'border-emerald-500/25 bg-emerald-500/[.05]'}`}><p className={`flex items-center gap-2 font-bold ${issues.length ? 'text-red-600' : 'text-emerald-600'}`}>{issues.length ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}Validation</p><p className="mt-1 text-muted-foreground">{issues.length ? issues.join(' · ') : 'All required salary and email checks passed.'}</p></div></div>}
  </article>;
}

function PayrollFieldGroup({ title, tone, fields, entry, editable, update, fieldIssues }) {
  return <section className="mb-5"><p className={`mb-3 text-xs font-bold uppercase ${tone === 'red' ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{title}</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{fields.map(([field, label, automatic]) => automatic ? <LockedAmount key={field} label={label} value={entry[field]} compact /> : <CurrencyAmountInput key={field} entry={entry} field={field} label={label} editable={editable} update={update} issue={fieldIssues[field]} />)}</div></section>;
}

function CurrencyAmountInput({ entry, field, label, editable, update, issue }) {
  const value = entry[field];
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => { if (!focused) setDraft(value === null || value === undefined ? '' : String(value)); }, [value, focused]);
  const change = (event) => { const raw = event.target.value.replace(/[^0-9.-]/g, ''); if (!/^-?[0-9]*(\.[0-9]{0,2})?$/.test(raw)) return; setDraft(raw); if (raw === '' || raw === '-' || raw === '.') { if (raw === '') update(entry.staffRecordId, field, ''); return; } update(entry.staffRecordId, field, raw); };
  const describedBy = issue ? `${entry.staffRecordId}-${field}-error` : undefined;
  return <label className="block text-[11px] font-semibold text-muted-foreground">{label}<input aria-invalid={Boolean(issue)} aria-describedby={describedBy} disabled={!editable} className={`mt-1 h-11 w-full rounded-lg border bg-background px-3 text-right text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted/40 ${issue ? 'border-red-500' : 'border-border'}`} inputMode="decimal" value={focused ? draft : value === null || value === undefined ? '' : money(value)} placeholder="GHS 0.00" onFocus={() => { setFocused(true); setDraft(value === null || value === undefined ? '' : String(value)); }} onBlur={() => setFocused(false)} onChange={change} />{issue && <span id={describedBy} className="mt-1 block text-[11px] font-semibold text-red-600">{issue}</span>}</label>;
}

function LockedAmount({ label, value, strong = false, compact = false }) { return <div className={`rounded-lg border border-blue-500/15 bg-blue-500/[.055] ${compact ? 'p-3' : 'p-3.5'}`}><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><Lock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /></div><p className={`mt-1 text-right ${strong ? 'font-bold text-primary' : 'font-semibold'}`}>{money(value)}</p></div>; }

function SaveStateIndicator({ state }) {
  const config = { saved: { label: state.at ? `Auto-saved ${new Date(state.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'All changes saved', icon: Cloud, tone: 'text-emerald-600' }, saving: { label: 'Auto-saving…', icon: Loader2, tone: 'text-blue-600' }, unsaved: { label: 'Unsaved changes', icon: CloudOff, tone: 'text-amber-600' }, blocked: { label: 'Unsaved — correct highlighted fields', icon: AlertCircle, tone: 'text-red-600' }, error: { label: 'Auto-save failed — use Save Draft', icon: CloudOff, tone: 'text-red-600' } }[state.kind] || { label: 'Save status unavailable', icon: CloudOff, tone: 'text-muted-foreground' };
  const Icon = config.icon;
  return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${config.tone}`}><Icon className={`h-4 w-4 ${state.kind === 'saving' ? 'animate-spin' : ''}`} />{config.label}</span>;
}

function payrollFieldIssues(entry) {
  return Object.fromEntries(manualFields.map((field) => { const value = entry[field]; let issue = ''; if (value === null || value === undefined || value === '') issue = 'Enter an amount, including 0.00 when not applicable.'; else if (!Number.isFinite(Number(value))) issue = 'Enter a valid Ghana cedi amount.'; else if (Number(value) < 0) issue = 'Amount cannot be negative.'; else if (field === 'basicSalary' && Number(value) <= 0) issue = 'Basic salary must be greater than GHS 0.00.'; else if (Number(value) > (field === 'basicSalary' ? 1000000 : 250000)) issue = 'This amount is unusually large and must be checked.'; return [field, issue]; }).filter(([, issue]) => issue));
}

function entryCanBeSaved(entry, changed) {
  const amountsAreSafe = manualFields.every((field) => { const value = entry[field]; return value === null || value === undefined || value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000000); });
  return amountsAreSafe && (!changed || Boolean(String(entry.changeReason || '').trim()));
}

function Metric({ label, value, accent }) { return <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-bold ${accent ? 'text-primary' : ''}`}>{value}</p></Card>; }
function Summary({ label, value, accent }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className={`font-bold ${accent ? 'text-primary' : ''}`}>{value}</p></div>; }
function ErrorBanner({ text }) { return <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{text}</div>; }
function entryHasChanges(entry, baseline = {}) { return trackedFields.some((field) => (entry[field] ?? null) !== (baseline[field] ?? null)); }
function batchStatus(status) { return ({ draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', generated: 'Generated', sent: 'Sent', partially_sent: 'Partially Sent', corrected: 'Corrected', cancelled: 'Cancelled' })[status] || status; }
