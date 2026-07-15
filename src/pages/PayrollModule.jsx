import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Calculator, CheckCircle2, ClipboardCheck, Clock3, Edit3, FileText, MessageSquareWarning, Plus, Save, Send, X, XCircle } from 'lucide-react';
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState(null);
  useEffect(() => { if (!batchId) return; getPayrollBatch(batchId).then((result) => { setBatch(result); setEntries(result.entries.map(calculateEntry)); }).catch((err) => setError(err.message)); }, [batchId]);
  const editable = ['draft', 'rejected', 'corrected'].includes(batch?.status) && can('payroll.prepare');
  const departments = [...new Set(entries.map((item) => item.department).filter(Boolean))].sort();
  const branches = [...new Set(entries.map((item) => item.branch).filter(Boolean))].sort();
  const visible = useMemo(() => entries.filter((entry) => Object.values(entry).join(' ').toLowerCase().includes(query.toLowerCase()) && (department === 'all' || entry.department === department) && (branch === 'all' || entry.branch === branch)), [entries, query, department, branch]);
  const baselineByStaff = useMemo(() => Object.fromEntries((batch?.baselineEntries || []).map((entry) => [entry.staffRecordId, entry])), [batch]);
  const issuesFor = (entry) => { const issues = entryIssues(entry); if (entryHasChanges(entry, baselineByStaff[entry.staffRecordId]) && !String(entry.changeReason || '').trim()) issues.push('Reason for change required'); return issues; };
  const invalid = entries.map((entry) => ({ entry, issues: issuesFor(entry) })).filter((item) => item.issues.length);
  const totals = useMemo(() => entries.reduce((sum, entry) => ({ income: sum.income + Number(entry.totalIncome || 0), deductions: sum.deductions + Number(entry.totalDeductions || 0), net: sum.net + Number(entry.netSalary || 0), employerSsf: sum.employerSsf + Number(entry.employerSsf || 0), employerPf: sum.employerPf + Number(entry.employerPf || 0) }), { income: 0, deductions: 0, net: 0, employerSsf: 0, employerPf: 0 }), [entries]);
  const update = (staffRecordId, field, raw) => setEntries((current) => current.map((entry) => entry.staffRecordId === staffRecordId ? calculateEntry({ ...entry, [field]: field === 'changeReason' ? raw : raw === '' ? null : Number(raw) }) : entry));
  const save = async (quiet = false) => { setBusy(true); try { const saved = await savePayrollDraft(batchId, entries); setBatch(saved); setEntries(saved.entries.map(calculateEntry)); setError(''); if (!quiet) toast.success('All current salary entries were saved safely.', { title: 'Payroll draft saved' }); return saved; } catch (err) { toast.error(err.message, { title: 'Payroll draft was not saved' }); return null; } finally { setBusy(false); } };
  const submit = async () => { if (invalid.length) { toast.warning(`Resolve validation issues for ${invalid.length} staff member${invalid.length === 1 ? '' : 's'} before submission.`, { title: 'Payroll needs attention' }); return; } const saved = await save(true); if (!saved) return; setBusy(true); try { const submitted = await submitPayrollBatch(batchId); setBatch(submitted); toast.success('The payroll is locked and waiting for an authorized approver.', { title: 'Payroll submitted' }); } catch (err) { toast.error(err.message, { title: 'Payroll was not submitted' }); } finally { setBusy(false); } };
  const cancel = async () => { if (!cancelReason?.trim()) return; setBusy(true); try { await cancelPayrollBatch(batchId, cancelReason); setCancelReason(null); toast.warning('The payroll batch was cancelled and retained in the audit history.', { title: 'Payroll cancelled' }); navigate('/payroll/batches'); } catch (err) { toast.error(err.message, { title: 'Payroll was not cancelled' }); } finally { setBusy(false); } };
  if (!batchId) return <div className="space-y-6"><PageHeader title="Payroll Entry" description="Open a draft payroll batch to enter salary details." /><Card className="text-center"><p className="text-sm text-muted-foreground">No payroll batch was selected.</p><Link to="/payroll/batches"><PrimaryButton className="mt-4">Go to payroll batches</PrimaryButton></Link></Card></div>;
  if (!batch) return <div className="space-y-6"><PageHeader title="Payroll Entry" description="Loading payroll batch…" />{error && <ErrorBanner text={error} />}</div>;
  return <div className="space-y-6"><PageHeader title={batch.name} description={editable ? `Enter salary figures directly.${batch.sourceBatchName ? ` Copied from ${batch.sourceBatchName}; only explain staff whose values changed.` : ''}` : 'This payroll is read-only because it is in review or has been finalized.'} actions={<><StatusBadge status={batchStatus(batch.status)} /><Link to="/payroll/batches"><SecondaryButton>Back to batches</SecondaryButton></Link></>} />
    {batch.rejectionReason && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800"><b>{batch.decisionType === 'request_correction' ? 'Correction requested' : 'Rejected'} by {batch.rejectedBy}:</b> {batch.rejectionReason}</div>}
    {error && <ErrorBanner text={error} />}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Total Income" value={money(totals.income)} /><Metric label="Total Deductions" value={money(totals.deductions)} /><Metric label="Net Salary" value={money(totals.net)} accent /><Metric label="Employer SSF" value={money(totals.employerSsf)} /><Metric label="Employer PF" value={money(totals.employerPf)} /></div>
    <Card><div className="mb-4 grid gap-3 lg:grid-cols-[1fr,220px,220px,auto]"><SearchBox value={query} onChange={setQuery} placeholder="Search staff name, ID or email" /><select className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)}><option value="all">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select><select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="all">All branches</option>{branches.map((item) => <option key={item}>{item}</option>)}</select><p className="self-center text-sm text-muted-foreground">{visible.length} staff</p></div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs"><span className="font-bold text-emerald-700">Income fields</span><span className="font-bold text-red-700">Deduction fields</span><span className="font-bold text-blue-700">Automatic totals</span></div>
      <div className="space-y-3 lg:hidden">{visible.map((entry) => <MobilePayrollCard key={entry.staffRecordId} entry={entry} editable={editable} update={update} changed={entryHasChanges(entry, baselineByStaff[entry.staffRecordId])} issues={issuesFor(entry)} />)}</div>
      <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[3340px] border-separate border-spacing-0 text-left text-xs"><thead className="sticky top-0 z-10 bg-card"><tr><th className="sticky left-0 z-20 min-w-56 border-b border-r border-border bg-card p-2">Staff member</th>{incomeFields.map(([, label]) => <th key={label} className="min-w-36 border-b border-border bg-emerald-500/10 p-2 text-emerald-800">{label}</th>)}<th className="min-w-36 border-b border-border bg-blue-500/10 p-2 text-blue-800">Total Income</th>{deductionFields.map(([, label]) => <th key={label} className="min-w-36 border-b border-border bg-red-500/10 p-2 text-red-800">{label}</th>)}<th className="min-w-36 border-b border-border bg-blue-500/10 p-2 text-blue-800">Total Deductions</th><th className="min-w-36 border-b border-border bg-blue-500/10 p-2 text-blue-800">Net Salary</th><th className="min-w-36 border-b border-border bg-amber-500/10 p-2">Employer SSF</th><th className="min-w-36 border-b border-border bg-amber-500/10 p-2">Employer PF</th><th className="min-w-60 border-b border-border bg-violet-500/10 p-2 text-violet-800">Reason for Change</th><th className="min-w-56 border-b border-border p-2">Validation</th></tr></thead><tbody>{visible.map((entry) => { const issues = issuesFor(entry); const changed = entryHasChanges(entry, baselineByStaff[entry.staffRecordId]); return <tr key={entry.staffRecordId} className={issues.length ? 'bg-red-500/[.03]' : ''}><td className="sticky left-0 z-[5] border-b border-r border-border bg-card p-2"><p className="font-semibold">{entry.fullName}</p><p className="text-muted-foreground">{entry.staffId} · {entry.email || 'No email'}</p>{changed && <p className="mt-1 font-semibold text-violet-700">Salary changed</p>}</td>{incomeFields.map(([field]) => <AmountCell key={field} entry={entry} field={field} editable={editable} update={update} />)}<ComputedCell value={entry.totalIncome} />{deductionFields.map(([field, , automatic]) => automatic ? <ComputedCell key={field} value={entry[field]} deduction /> : <AmountCell key={field} entry={entry} field={field} editable={editable} update={update} deduction />)}<ComputedCell value={entry.totalDeductions} /><ComputedCell value={entry.netSalary} strong /><ComputedCell value={entry.employerSsf} employer /><ComputedCell value={entry.employerPf} employer /><td className="border-b border-border p-1"><input disabled={!editable || !changed} className={`h-9 w-full rounded-md border bg-background px-2 text-xs disabled:bg-muted/40 ${changed && !entry.changeReason?.trim() ? 'border-red-500' : 'border-border'}`} value={entry.changeReason || ''} placeholder={changed ? 'Required explanation' : 'No change'} onChange={(e) => update(entry.staffRecordId, 'changeReason', e.target.value)} /></td><td className="border-b border-border p-2">{issues.length ? <span className="font-semibold text-red-600">{issues.join(', ')}</span> : <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Ready</span>}</td></tr>; })}</tbody></table></div>
    </Card>
    {editable && <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur sm:flex-row sm:items-center"><div className="flex-1">{invalid.length ? <p className="flex items-center gap-2 text-sm font-semibold text-red-600"><AlertCircle className="h-4 w-4" />{invalid.length} staff record{invalid.length === 1 ? '' : 's'} require attention</p> : <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" />All payroll entries are ready for submission</p>}</div><SecondaryButton disabled={busy} onClick={() => save(false)}><Save className="h-4 w-4" /> Save Draft</SecondaryButton><PrimaryButton disabled={busy || invalid.length > 0} onClick={submit}><Send className="h-4 w-4" /> Submit for Approval</PrimaryButton><button disabled={busy} onClick={() => setCancelReason('')} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-500/10"><XCircle className="h-4 w-4" /> Cancel Batch</button></div>}
    <ConfirmActionDialog open={cancelReason !== null} title="Cancel this payroll batch?" description="The batch will be locked as cancelled and retained permanently in the audit history. It will not be deleted." confirmLabel="Cancel payroll batch" tone="danger" inputLabel="Reason for cancellation" inputType="textarea" inputPlaceholder="Enter the required audit reason" required value={cancelReason || ''} onValueChange={setCancelReason} busy={busy} onClose={() => setCancelReason(null)} onConfirm={cancel} />
  </div>;
}

function MobilePayrollCard({ entry, editable, update, changed, issues }) {
  return <details className={`rounded-xl border ${issues.length ? 'border-red-500/40' : 'border-border'} bg-background`}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-semibold">{entry.fullName}</p><p className="truncate text-xs text-muted-foreground">{entry.staffId} · {entry.email || 'No email'}</p></div><StatusBadge status={issues.length ? `${issues.length} Issues` : changed ? 'Changed' : 'Ready'} /></summary><div className="border-t border-border p-4"><MobileFieldGroup title="Income" tone="emerald" fields={incomeFields} entry={entry} editable={editable} update={update} /><MobileFieldGroup title="Deductions" tone="red" fields={deductionFields} entry={entry} editable={editable} update={update} /><div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-blue-500/[.06] p-3 text-xs"><MobileTotal label="Total income" value={entry.totalIncome} /><MobileTotal label="Deductions" value={entry.totalDeductions} /><MobileTotal label="Net salary" value={entry.netSalary} strong /><MobileTotal label="Employer SSF" value={entry.employerSsf} /></div>{changed && <label className="mt-4 block text-xs font-semibold">Reason for change<input className={`mt-1 h-10 w-full rounded-lg border bg-background px-3 ${!entry.changeReason?.trim() ? 'border-red-500' : 'border-border'}`} value={entry.changeReason || ''} disabled={!editable} onChange={(e) => update(entry.staffRecordId, 'changeReason', e.target.value)} /></label>}{issues.length > 0 && <p className="mt-3 text-xs font-semibold text-red-600">{issues.join(' · ')}</p>}</div></details>;
}
function MobileFieldGroup({ title, tone, fields, entry, editable, update }) { return <div className="mb-4"><p className={`mb-2 text-xs font-bold uppercase ${tone === 'red' ? 'text-red-700' : 'text-emerald-700'}`}>{title}</p><div className="grid grid-cols-2 gap-2">{fields.map(([field, label, automatic]) => <label key={field} className="text-[11px] text-muted-foreground">{label}<input className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-right text-sm disabled:bg-muted/50" type="number" min="0" step="0.01" disabled={!editable || Boolean(automatic)} value={entry[field] ?? ''} onChange={(e) => update(entry.staffRecordId, field, e.target.value)} /></label>)}</div></div>; }
function MobileTotal({ label, value, strong }) { return <div><p className="text-muted-foreground">{label}</p><p className={strong ? 'font-bold text-primary' : 'font-semibold'}>{money(value)}</p></div>; }

function AmountCell({ entry, field, editable, update, deduction = false }) {
  const invalid = entry[field] === null || entry[field] === undefined || Number(entry[field]) < 0 || Number(entry[field]) > (field === 'basicSalary' ? 1000000 : 250000);
  return <td className={`border-b border-border p-1 ${deduction ? 'bg-red-500/[.025]' : 'bg-emerald-500/[.025]'}`}><input aria-label={`${entry.fullName} ${field}`} disabled={!editable} className={`h-9 w-full rounded-md border bg-background px-2 text-right text-xs outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted/40 ${invalid ? 'border-red-500' : 'border-border'}`} type="number" min="0" step="0.01" value={entry[field] ?? ''} onChange={(e) => update(entry.staffRecordId, field, e.target.value)} /></td>;
}
function ComputedCell({ value, strong, deduction, employer }) { return <td className={`border-b border-border p-2 text-right ${strong ? 'font-bold text-primary' : ''} ${deduction ? 'bg-red-500/[.04]' : employer ? 'bg-amber-500/[.04]' : 'bg-blue-500/[.04]'}`}>{money(value)}</td>; }
function Metric({ label, value, accent }) { return <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-bold ${accent ? 'text-primary' : ''}`}>{value}</p></Card>; }
function Summary({ label, value, accent }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className={`font-bold ${accent ? 'text-primary' : ''}`}>{value}</p></div>; }
function ErrorBanner({ text }) { return <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{text}</div>; }
function entryHasChanges(entry, baseline = {}) { return trackedFields.some((field) => (entry[field] ?? null) !== (baseline[field] ?? null)); }
function batchStatus(status) { return ({ draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', generated: 'Generated', sent: 'Sent', partially_sent: 'Partially Sent', corrected: 'Corrected', cancelled: 'Cancelled' })[status] || status; }
