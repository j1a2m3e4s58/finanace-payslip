import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator, Check, ClipboardCheck, Copy, Edit3, FileText, Plus, Send, UserRound } from 'lucide-react';
import { createPayrollBatch, getPayrollBatches, revisePayrollBatch } from '@/api/portalClient';
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/payroll/PageElements';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';
import ConfirmActionDialog from '@/components/ui/confirm-action-dialog';
import ResponsiveSheet from '@/components/ui/responsive-sheet';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</section>;
const inputClass = 'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const money = (value) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value || 0));
const workflowSteps = ['Draft', 'Submitted', 'Approved', 'Generated', 'Sent'];
const statusTabs = [
  ['all', 'All'], ['draft', 'Draft'], ['submitted', 'Submitted'], ['approved', 'Approved'], ['sent', 'Sent'], ['cancelled', 'Cancelled'],
];
const groupedStatuses = {
  draft: ['draft', 'rejected', 'corrected'], submitted: ['submitted'], approved: ['approved', 'generated'],
  sent: ['sent', 'partially_sent'], cancelled: ['cancelled'],
};

export default function PayrollBatches() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ period: new Date().toISOString().slice(0, 7), name: '', sourceBatchId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revisionAction, setRevisionAction] = useState(null);
  const [copyAction, setCopyAction] = useState(null);

  const load = () => getPayrollBatches().then((rows) => { setBatches(rows); setError(''); }).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!form.period) return;
    const date = new Date(`${form.period}-01T00:00:00`);
    setForm((current) => ({ ...current, name: `${date.toLocaleString('en-GB', { month: 'long', year: 'numeric' })} Payroll` }));
  }, [form.period]);

  const copySources = batches.filter((batch) => batch.status !== 'cancelled' && batch.period < form.period);
  const counts = useMemo(() => Object.fromEntries(statusTabs.map(([key]) => [key, key === 'all' ? batches.length : batches.filter((batch) => groupedStatuses[key]?.includes(batch.status)).length])), [batches]);
  const visibleBatches = activeTab === 'all' ? batches : batches.filter((batch) => groupedStatuses[activeTab]?.includes(batch.status));
  const createNow = async (payload) => {
    setBusy(true);
    try {
      const batch = await createPayrollBatch(payload);
      setCopyAction(null); setCreating(false);
      toast.success(`${batch.name} is ready for salary entry.`, { title: payload.sourceBatchId ? 'Payroll copied safely' : 'Payroll batch created' });
      navigate(`/payroll/entry?batch=${batch.id}`);
    } catch (err) { toast.error(err.message, { title: 'Payroll batch was not created' }); }
    finally { setBusy(false); }
  };
  const create = (event) => {
    event.preventDefault();
    if (form.sourceBatchId) {
      setCopyAction({ payload: { ...form }, source: copySources.find((batch) => batch.id === form.sourceBatchId) });
      return;
    }
    createNow({ ...form });
  };
  const revise = async () => {
    if (!revisionAction?.reason.trim()) return;
    const { batch, reason } = revisionAction;
    setBusy(true);
    try {
      const revision = await revisePayrollBatch(batch.id, reason);
      setRevisionAction(null);
      toast.warning('A new correction version was created; the original remains unchanged.', { title: 'Payroll revision created' });
      navigate(`/payroll/entry?batch=${revision.id}`);
    } catch (err) { toast.error(err.message, { title: 'Revision was not created' }); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <PageHeader title="Payroll Batches" description="Create and track every monthly payroll from salary preparation through private delivery." actions={can('payroll.prepare') ? <PrimaryButton onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create payroll batch</PrimaryButton> : null} />
    {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-2 sm:flex sm:overflow-x-auto">{statusTabs.map(([key, label]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`min-h-10 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${activeTab === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{label} <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] sm:ml-1 ${activeTab === key ? 'bg-white/20' : 'bg-muted'}`}>{counts[key]}</span></button>)}</div>
    <div className="grid gap-4">{visibleBatches.map((batch) => <PayrollBatchCard key={batch.id} batch={batch} can={can} busy={busy} setRevisionAction={setRevisionAction} />)}{!visibleBatches.length && <Card className="py-12 text-center"><Calculator className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 font-heading text-lg font-bold">No {activeTab === 'all' ? '' : `${statusTabs.find(([key]) => key === activeTab)?.[1].toLowerCase()} `}payroll batches</h2><p className="mt-1 text-sm text-muted-foreground">{activeTab === 'draft' ? 'Create a payroll batch to begin salary entry.' : 'Choose another status tab to view payroll records.'}</p></Card>}</div>
    {creating && <CreatePayrollDialog form={form} setForm={setForm} copySources={copySources} busy={busy} create={create} close={() => setCreating(false)} />}
    <ConfirmActionDialog open={Boolean(copyAction)} title="Copy the previous payroll?" description="Salary details will be copied into a new draft. The source payroll remains permanent and unchanged." confirmLabel="Copy and create payroll" busy={busy} onClose={() => setCopyAction(null)} onConfirm={() => createNow(copyAction.payload)}><div className="rounded-xl border border-border bg-muted/30 p-4 text-sm"><p><span className="text-muted-foreground">Copy from:</span> <b>{copyAction?.source?.name}</b></p><p className="mt-2"><span className="text-muted-foreground">Create:</span> <b>{copyAction?.payload?.name}</b></p><p className="mt-2 text-xs text-muted-foreground">Only active staff are included. Finance must review every copied amount before submission.</p></div></ConfirmActionDialog>
    <ConfirmActionDialog open={Boolean(revisionAction)} title="Create a revised payslip version?" description="The original sent payslips will remain permanent. A separate correction version will be created and must pass approval before it can be sent." confirmLabel="Create revision" inputLabel="Reason for revision" inputType="textarea" inputPlaceholder="Explain why this correction is required" required value={revisionAction?.reason || ''} onValueChange={(reason) => setRevisionAction((current) => current ? { ...current, reason } : current)} busy={busy} onClose={() => setRevisionAction(null)} onConfirm={revise} />
  </div>;
}

function PayrollBatchCard({ batch, can, busy, setRevisionAction }) {
  const next = nextAction(batch.status);
  return <Card className="overflow-hidden p-0"><div className="grid gap-5 p-5 xl:grid-cols-[minmax(230px,.8fr),minmax(360px,1.25fr),auto] xl:items-start"><div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={batchStatus(batch.status)} /><span className="text-xs font-semibold text-muted-foreground">Version {batch.version || 1}</span></div><h2 className="mt-2 font-heading text-xl font-bold">{batch.name}</h2><p className="mt-1 text-xs text-muted-foreground">Payroll period {batch.period}</p>{batch.sourceBatchName && <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"><Copy className="h-3.5 w-3.5" /> Copied from {batch.sourceBatchName}</p>}{batch.salaryChangeCount > 0 && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">{batch.salaryChangeCount} tracked salary changes</p>}{batch.rejectionReason && <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-700 dark:text-red-400">Returned: {batch.rejectionReason}</p>}</div><div><PayrollProgress status={batch.status} /><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Summary label="Staff" value={batch.summary?.staffCount || 0} /><Summary label="Income" value={money(batch.summary?.totalIncome)} /><Summary label="Deductions" value={money(batch.summary?.totalDeductions)} /><Summary label="Net salary" value={money(batch.summary?.totalNetSalary)} accent /></div></div><div className="min-w-52 xl:text-right"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Next required action</p><p className={`mt-1 text-sm font-semibold ${next.tone}`}>{next.label}</p><div className="mt-4 flex flex-wrap gap-2 xl:justify-end"><BatchActions batch={batch} can={can} busy={busy} setRevisionAction={setRevisionAction} /></div></div></div><div className="grid gap-3 border-t border-border bg-muted/20 px-5 py-4 sm:grid-cols-3"><Actor label="Created by" name={batch.createdBy} timestamp={batch.createdAt} /><Actor label="Submitted by" name={batch.submittedBy} timestamp={batch.submittedAt} /><Actor label="Approved by" name={batch.approvedBy} timestamp={batch.approvedAt} /></div></Card>;
}

function BatchActions({ batch, can, busy, setRevisionAction }) {
  if (batch.status === 'draft' && can('payroll.prepare')) return <Link to={`/payroll/entry?batch=${batch.id}`}><PrimaryButton><Edit3 className="h-4 w-4" /> Continue Editing</PrimaryButton></Link>;
  if (['rejected', 'corrected'].includes(batch.status) && can('payroll.prepare')) return <Link to={`/payroll/entry?batch=${batch.id}`}><PrimaryButton><Edit3 className="h-4 w-4" /> {batch.status === 'rejected' ? 'Correct Batch' : 'Continue Correction'}</PrimaryButton></Link>;
  return <>{batch.status === 'submitted' && can('payroll.approve') && <Link to={`/payroll/approvals?batch=${batch.id}`}><PrimaryButton><ClipboardCheck className="h-4 w-4" /> Review Payroll</PrimaryButton></Link>}{['approved', 'generated', 'partially_sent', 'sent'].includes(batch.status) && can('payslips.preview') && <Link to={`/payslips/preview?batch=${batch.id}`}><SecondaryButton><FileText className="h-4 w-4" /> {batch.status === 'approved' ? 'Generate Payslips' : 'Open Payslips'}</SecondaryButton></Link>}{['generated', 'partially_sent'].includes(batch.status) && can('payslips.send') && <Link to="/payslips/send"><PrimaryButton><Send className="h-4 w-4" /> {batch.status === 'generated' ? 'Send Payslips' : 'Retry Delivery'}</PrimaryButton></Link>}{['sent', 'partially_sent'].includes(batch.status) && can('payroll.prepare') && <SecondaryButton disabled={busy} onClick={() => setRevisionAction({ batch, reason: '' })}><Edit3 className="h-4 w-4" /> Create Revision</SecondaryButton>}{!['draft', 'rejected', 'corrected'].includes(batch.status) && <Link to={`/payroll/entry?batch=${batch.id}`}><SecondaryButton>View Payroll</SecondaryButton></Link>}</>;
}

function PayrollProgress({ status }) {
  if (status === 'cancelled') return <div className="rounded-lg border border-red-500/25 bg-red-500/[.06] p-3 text-sm font-semibold text-red-700 dark:text-red-400">This payroll was cancelled and retained for audit history.</div>;
  const current = workflowIndex(status);
  return <div><div className="space-y-2 sm:hidden">{workflowSteps.map((step, index) => { const complete = current > index; const active = current === index; return <div key={step} className={`flex items-center gap-3 rounded-lg border p-2.5 ${active ? 'border-primary bg-primary/[.06]' : 'border-border'}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${complete ? 'border-emerald-600 bg-emerald-600 text-white' : active ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>{complete ? <Check className="h-4 w-4" /> : index + 1}</span><div><p className={`text-xs font-bold ${active ? 'text-primary' : complete ? 'text-emerald-600' : 'text-muted-foreground'}`}>{step}</p><p className="text-[10px] text-muted-foreground">{complete ? 'Completed' : active ? 'Current stage' : 'Waiting'}</p></div></div>; })}</div><div className="hidden grid-cols-5 gap-1 sm:grid">{workflowSteps.map((step, index) => { const complete = current > index; const active = current === index; return <div key={step} className="relative text-center"><span className={`relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full border-2 text-[11px] font-bold ${complete ? 'border-emerald-600 bg-emerald-600 text-white' : active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>{complete ? <Check className="h-4 w-4" /> : index + 1}</span><p className={`mt-1.5 text-[11px] font-semibold ${active ? 'text-primary' : complete ? 'text-emerald-600' : 'text-muted-foreground'}`}>{step}</p>{index < workflowSteps.length - 1 && <span className={`absolute left-[calc(50%+1rem)] right-[calc(-50%+1rem)] top-4 h-0.5 ${current > index ? 'bg-emerald-600' : 'bg-border'}`} />}</div>; })}</div>{['rejected', 'corrected'].includes(status) && <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs font-semibold text-amber-700 dark:text-amber-400">Correction stage: update the returned payroll, then submit it again.</p>}</div>;
}

function CreatePayrollDialog({ form, setForm, copySources, busy, create, close }) {
  return <ResponsiveSheet open onOpenChange={(next) => !next && close()} title="Create payroll batch" description="Only active staff will be included in the new draft."><form onSubmit={create} className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">Payroll month</span><input className={inputClass} type="month" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value, sourceBatchId: '' })} required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">Batch name</span><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">Copy salary details from</span><select className={inputClass} value={form.sourceBatchId} onChange={(event) => setForm({ ...form, sourceBatchId: event.target.value })}><option value="">Start with empty salary fields</option>{copySources.map((batch) => <option key={batch.id} value={batch.id}>{batch.name} · {batchStatus(batch.status)}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">A confirmation will appear before any salary values are copied.</p></label><div className="grid gap-2 sm:grid-cols-2"><PrimaryButton disabled={busy} type="submit">{busy ? 'Creating…' : form.sourceBatchId ? 'Review Copy' : 'Create and Enter Salaries'}</PrimaryButton><SecondaryButton type="button" onClick={close}>Cancel</SecondaryButton></div></form></ResponsiveSheet>;
}

function Actor({ label, name, timestamp }) { return <div className="flex items-start gap-2"><span className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary"><UserRound className="h-3.5 w-3.5" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className="truncate text-xs font-semibold">{name || 'Not yet'}</p>{timestamp && <time className="text-[10px] text-muted-foreground">{new Date(timestamp).toLocaleString('en-GB')}</time>}</div></div>; }
function Summary({ label, value, accent = false }) { return <div className="rounded-lg bg-muted/40 p-3"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`mt-1 truncate text-sm font-bold ${accent ? 'text-primary' : ''}`} title={String(value)}>{value}</p></div>; }
function batchStatus(status) { return ({ draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', generated: 'Generated', sent: 'Sent', partially_sent: 'Partially Sent', corrected: 'Corrected', cancelled: 'Cancelled' })[status] || status; }
function workflowIndex(status) { return ({ draft: 0, rejected: 0, corrected: 0, submitted: 1, approved: 2, generated: 3, partially_sent: 4, sent: 4 })[status] ?? -1; }
function nextAction(status) { return ({ draft: { label: 'Complete salary entry', tone: 'text-primary' }, rejected: { label: 'Correct and resubmit', tone: 'text-red-600' }, corrected: { label: 'Submit corrected payroll', tone: 'text-amber-700 dark:text-amber-400' }, submitted: { label: 'Finance approval', tone: 'text-amber-700 dark:text-amber-400' }, approved: { label: 'Generate payslip PDFs', tone: 'text-primary' }, generated: { label: 'Send payslips privately', tone: 'text-primary' }, partially_sent: { label: 'Retry failed deliveries', tone: 'text-red-600' }, sent: { label: 'Workflow complete', tone: 'text-emerald-600' }, cancelled: { label: 'No further action', tone: 'text-muted-foreground' } })[status] || { label: 'Review payroll', tone: 'text-muted-foreground' }; }
