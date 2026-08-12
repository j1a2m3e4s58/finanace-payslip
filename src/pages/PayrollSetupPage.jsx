import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, CheckCircle2, Edit3, Eye, History, Lock, Plus, Save, Send, Trash2, UserRoundCog, XCircle } from 'lucide-react';
import {
  decidePayrollSetup,
  getPayrollSetup,
  getPayrollSetupImpact,
  savePayrollSetup,
  setPayrollSetupLock,
  submitPayrollSetup,
} from '@/api/portalClient';
import { PageHeader, PrimaryButton, SecondaryButton } from '@/components/payroll/PageElements';
import ConfirmActionDialog from '@/components/ui/confirm-action-dialog';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';

const Card = ({ children, className = '', ...props }) => <section {...props} className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</section>;
const input = 'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60';
const emptyValues = (fields = []) => Object.fromEntries(fields.map(({ key }) => [key, '']));
const money = (value) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value || 0));
const displayDate = (value) => value ? new Date(value).toLocaleString() : 'Not recorded';
const statusStyle = {
  draft: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  submitted: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  approved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  rejected: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
};

export default function PayrollSetupPage() {
  const { can, user } = useAuth();
  const canManage = can('payroll.setup.manage');
  const canApprove = can('payroll.setup.approve');
  const [data, setData] = useState(null);
  const [effectiveMonth, setEffectiveMonth] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [globalValues, setGlobalValues] = useState({});
  const [overrides, setOverrides] = useState([]);
  const [reason, setReason] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [staffValues, setStaffValues] = useState({});
  const [staffReason, setStaffReason] = useState('');
  const [staffEffectiveMonth, setStaffEffectiveMonth] = useState('');
  const [staffExpiryMonth, setStaffExpiryMonth] = useState('');
  const [impact, setImpact] = useState(null);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState('');
  const [openDraftReason, setOpenDraftReason] = useState('');

  const hydrate = (response) => {
    setData(response);
    setEffectiveMonth(response.setup.effectiveMonth || '');
    setExpiryMonth(response.setup.expiryMonth || '');
    setGlobalValues(Object.fromEntries(response.globalFields.map(({ key }) => [key, response.setup.globalValues?.[key] ?? ''])));
    setOverrides(response.setup.staffOverrides || []);
    setReason(response.setup.changeReason || '');
    setSelectedStaffId('');
    setStaffValues(emptyValues(response.staffFields));
    setStaffReason('');
    setStaffEffectiveMonth(response.setup.effectiveMonth || '');
    setStaffExpiryMonth('');
    if (response.impact) setImpact(response.impact);
  };
  const load = async () => {
    try {
      const response = await getPayrollSetup();
      hydrate(response);
      if (response.setup.configured) {
        const preview = await getPayrollSetupImpact();
        setImpact(preview.impact);
      }
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const staffById = useMemo(() => Object.fromEntries((data?.staff || []).map((staff) => [staff.id, staff])), [data?.staff]);
  const selectedOverride = overrides.find((item) => item.staffRecordId === selectedStaffId);
  const status = data?.setup?.status || 'draft';
  const editable = canManage && !data?.setup?.locked && status !== 'submitted';

  const selectStaff = (staffId) => {
    setSelectedStaffId(staffId);
    const existing = overrides.find((item) => item.staffRecordId === staffId);
    setStaffValues(Object.fromEntries((data?.staffFields || []).map(({ key }) => [key, existing?.values?.[key] ?? ''])));
    setStaffReason(existing?.reason || '');
    setStaffEffectiveMonth(existing?.effectiveMonth || effectiveMonth);
    setStaffExpiryMonth(existing?.expiryMonth || '');
  };
  const addOverride = () => {
    if (!selectedStaffId) return toast.warning('Select a staff member first.', { title: 'Staff required' });
    if (staffReason.trim().length < 5) return toast.warning('Enter the reason for this staff-specific change.', { title: 'Reason required' });
    if (!staffEffectiveMonth) return toast.warning('Choose when this staff adjustment takes effect.', { title: 'Effective month required' });
    if (staffExpiryMonth && staffExpiryMonth < staffEffectiveMonth) return toast.warning('Expiry cannot be earlier than the effective month.', { title: 'Invalid date range' });
    const values = Object.fromEntries(Object.entries(staffValues).map(([key, value]) => [key, value === '' ? null : Number(value)]));
    if (!Object.values(values).some((value) => value !== null)) return toast.warning('Enter at least one staff-specific amount.', { title: 'Amount required' });
    const next = { staffRecordId: selectedStaffId, values, reason: staffReason.trim(), effectiveMonth: staffEffectiveMonth, expiryMonth: staffExpiryMonth };
    setOverrides((current) => [...current.filter((item) => item.staffRecordId !== selectedStaffId), next]);
    toast.success(`${staffById[selectedStaffId]?.fullName || 'Staff'} has been added to this draft.`, { title: selectedOverride ? 'Adjustment updated' : 'Adjustment added' });
  };
  const editOverride = (item) => {
    selectStaff(item.staffRecordId);
    document.getElementById('staff-specific-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const removeOverride = (staffRecordId) => {
    setOverrides((current) => current.filter((item) => item.staffRecordId !== staffRecordId));
    if (selectedStaffId === staffRecordId) selectStaff('');
  };

  const save = async () => {
    if (reason.trim().length < 5) return toast.warning('Enter a reason for this proposed change.', { title: 'Reason required' });
    if (!effectiveMonth) return toast.warning('Select an effective month.', { title: 'Effective month required' });
    if (expiryMonth && expiryMonth < effectiveMonth) return toast.warning('Expiry cannot be earlier than the effective month.', { title: 'Invalid date range' });
    setBusy('save');
    try {
      const response = await savePayrollSetup({
        expectedVersion: data.setup.version,
        effectiveMonth,
        expiryMonth,
        globalValues: Object.fromEntries(Object.entries(globalValues).map(([key, value]) => [key, value === '' ? null : Number(value)])),
        staffOverrides: overrides,
        reason: reason.trim(),
      });
      hydrate(response);
      setError('');
      toast.success('Draft saved. No payroll figures were activated.', { title: 'Draft saved safely' });
    } catch (err) {
      setError(err.message);
      toast.error(err.message, { title: 'Draft was not saved' });
    } finally {
      setBusy('');
    }
  };
  const submit = async () => {
    setBusy('submit');
    try {
      const response = await submitPayrollSetup(data.setup.version);
      hydrate(response);
      setConfirmAction('');
      toast.success('The setup is locked and waiting for a different approver.', { title: 'Submitted for approval' });
    } catch (err) {
      toast.error(err.message, { title: 'Setup was not submitted' });
    } finally {
      setBusy('');
    }
  };
  const decide = async (decision) => {
    if (decision === 'reject' && comments.trim().length < 5) return toast.warning('Enter a clear rejection reason.', { title: 'Reason required' });
    setBusy(decision);
    try {
      const response = await decidePayrollSetup(decision, comments.trim());
      hydrate(response);
      setComments('');
      setConfirmAction('');
      toast.success(
        decision === 'approve' ? `${response.updatedStaffEntries || 0} entries in ${response.updatedBatches || 0} editable batches were updated.` : 'Finance can now correct and resubmit the setup.',
        { title: decision === 'approve' ? 'Setup approved and activated' : 'Setup returned for correction' },
      );
    } catch (err) {
      toast.error(err.message, { title: decision === 'approve' ? 'Approval failed' : 'Rejection failed' });
    } finally {
      setBusy('');
    }
  };
  const openNewDraft = async () => {
    setBusy('open');
    try {
      const response = await setPayrollSetupLock(false, openDraftReason.trim());
      hydrate(response);
      setOpenDraftReason('');
      setConfirmAction('');
      toast.success('A new editable proposal has been opened. The approved version remains active.', { title: 'New draft opened' });
    } catch (err) {
      toast.error(err.message, { title: 'Draft could not be opened' });
    } finally {
      setBusy('');
    }
  };

  if (!data) return <Card>{error || 'Loading salary and allowance setup…'}</Card>;
  return <div className="space-y-6">
    <PageHeader
      title="Salary & Allowance Setup"
      description="Prepare dated salary rules, preview their effect, and activate them through independent approval."
      actions={<div className="flex flex-wrap gap-2">
        {status === 'approved' && canManage && <SecondaryButton onClick={() => setConfirmAction('open')}><Edit3 className="h-4 w-4" /> Open new draft</SecondaryButton>}
        {status === 'draft' && editable && <PrimaryButton disabled={busy === 'save'} onClick={save}><Save className="h-4 w-4" /> Save draft</PrimaryButton>}
      </div>}
    />
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>}

    <div className={`rounded-xl border p-4 ${statusStyle[status] || statusStyle.draft}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="flex items-center gap-2 font-bold"><Lock className="h-4 w-4" /> Setup status: <span className="capitalize">{status}</span></p><p className="mt-1 text-sm opacity-80">{status === 'draft' ? 'Changes are proposals only and do not affect payroll.' : status === 'submitted' ? `Awaiting independent approval. Submitted by ${data.setup.submittedBy || 'Finance'}.` : status === 'approved' ? `Version ${data.setup.version} is active and immutable.` : `Returned for correction: ${data.setup.rejectionReason}`}</p></div>
        <div className="text-xs"><b>Effective:</b> {data.setup.effectiveMonth} <span className="mx-1">→</span> <b>Expires:</b> {data.setup.expiryMonth || 'No expiry'}</div>
      </div>
    </div>

    <ImpactCard impact={impact} onRefresh={async () => {
      setBusy('impact');
      try { setImpact((await getPayrollSetupImpact()).impact); } catch (err) { toast.error(err.message, { title: 'Impact preview failed' }); } finally { setBusy(''); }
    }} busy={busy === 'impact'} />

    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 className="font-heading text-xl font-bold">Bank-wide recurring values</h2><p className="text-sm text-muted-foreground">These values apply to all active staff only during the stated date range.</p></div>
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-lg">
          <MonthInput label="Effective month" value={effectiveMonth} disabled={!editable} onChange={setEffectiveMonth} />
          <MonthInput label="Expiry month (optional)" value={expiryMonth} disabled={!editable} min={effectiveMonth} onChange={setExpiryMonth} />
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.globalFields.map((field) => <MoneyInput key={field.key} field={field} value={globalValues[field.key]} disabled={!editable} onChange={(value) => setGlobalValues((current) => ({ ...current, [field.key]: value }))} />)}</div>
    </Card>

    <Card id="staff-specific-editor">
      <div className="flex items-center gap-2"><UserRoundCog className="h-5 w-5 text-primary" /><div><h2 className="font-heading text-xl font-bold">Individual staff adjustment</h2><p className="text-sm text-muted-foreground">A staff exception can start and expire independently of the bank-wide values.</p></div></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="xl:col-span-2"><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Staff member</span><select className={input} disabled={!editable} value={selectedStaffId} onChange={(event) => selectStaff(event.target.value)}><option value="">Select active staff</option>{data.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.fullName} · {staff.staffId} · {staff.department}</option>)}</select></label>
        <MonthInput label="Effective month" value={staffEffectiveMonth} disabled={!editable || !selectedStaffId} onChange={setStaffEffectiveMonth} />
        <MonthInput label="Expiry month (optional)" value={staffExpiryMonth} min={staffEffectiveMonth} disabled={!editable || !selectedStaffId} onChange={setStaffExpiryMonth} />
      </div>
      <label className="mt-4 block"><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Reason for this individual adjustment</span><input className={input} disabled={!editable || !selectedStaffId} value={staffReason} onChange={(event) => setStaffReason(event.target.value)} placeholder="Example: Promotion effective August 2026" /></label>
      {selectedStaffId && <><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.staffFields.map((field) => <MoneyInput key={field.key} field={field} value={staffValues[field.key]} disabled={!editable} note={field.key === 'basicSalary' ? 'Staff-specific salary' : 'Blank uses the bank-wide value'} onChange={(value) => setStaffValues((current) => ({ ...current, [field.key]: value }))} />)}</div><PrimaryButton className="mt-5" disabled={!editable} onClick={addOverride}><Plus className="h-4 w-4" />{selectedOverride ? 'Update staff adjustment' : 'Add staff adjustment'}</PrimaryButton></>}
    </Card>

    <Card>
      <h2 className="font-heading text-xl font-bold">Staff-specific adjustments</h2>
      <p className="text-sm text-muted-foreground">{overrides.length} controlled exception{overrides.length === 1 ? '' : 's'} in this version.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{overrides.map((item) => {
        const staff = staffById[item.staffRecordId] || {};
        const values = Object.entries(item.values || {}).filter(([, value]) => value !== null && value !== '');
        return <article key={item.staffRecordId} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{staff.fullName || item.staffRecordId}</p><p className="text-xs text-muted-foreground">{staff.staffId} · {staff.department} · {staff.branch}</p><p className="mt-1 text-xs font-semibold text-primary">{item.effectiveMonth || effectiveMonth} → {item.expiryMonth || 'No expiry'}</p></div>{editable && <div className="flex gap-1"><button onClick={() => editOverride(item)} className="grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-muted" aria-label={`Edit ${staff.fullName || 'staff'} adjustment`}><Edit3 className="h-4 w-4" /></button><button onClick={() => removeOverride(item.staffRecordId)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-red-600 hover:bg-red-500/10" aria-label={`Remove ${staff.fullName || 'staff'} adjustment`}><Trash2 className="h-4 w-4" /></button></div>}</div><div className="mt-3 grid grid-cols-2 gap-2">{values.map(([key, value]) => <div key={key} className="rounded-lg bg-muted/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">{data.staffFields.find((field) => field.key === key)?.label || key}</p><p className="text-xs font-bold">{money(value)}</p></div>)}</div><p className="mt-3 text-xs text-muted-foreground"><b>Reason:</b> {item.reason}</p></article>;
      })}{!overrides.length && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:col-span-2">No staff-specific adjustments in this version.</div>}</div>
    </Card>

    {canManage && ['draft', 'rejected'].includes(status) && <Card className="sticky bottom-20 z-20 shadow-xl lg:bottom-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end"><label className="flex-1"><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Reason for this proposal</span><input className={input} disabled={!editable} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the approved business reason" /></label><SecondaryButton disabled={!editable || busy === 'save'} onClick={save}><Save className="h-4 w-4" /> Save draft</SecondaryButton><PrimaryButton disabled={!editable || !data.setup.configured} onClick={() => setConfirmAction('submit')}><Send className="h-4 w-4" /> Submit for approval</PrimaryButton></div>
    </Card>}

    {canApprove && status === 'submitted' && <Card className="border-amber-500/30">
      <h2 className="font-heading text-xl font-bold">Independent approval decision</h2>
      <p className="mt-1 text-sm text-muted-foreground">Confirm the dates, values, exceptions, and impact above. Activation updates editable payroll batches as one database transaction.</p>
      {String(data.setup.submittedById || '') === String(user?.id || '') && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm font-semibold text-red-700">You prepared this setup, so another approver must decide it.</p>}
      <label className="mt-4 block"><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Approval comments or rejection reason</span><textarea className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" value={comments} onChange={(event) => setComments(event.target.value)} /></label>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><PrimaryButton disabled={String(data.setup.submittedById || '') === String(user?.id || '')} onClick={() => setConfirmAction('approve')}><CheckCircle2 className="h-4 w-4" /> Approve and activate</PrimaryButton><SecondaryButton className="text-red-600" onClick={() => setConfirmAction('reject')}><XCircle className="h-4 w-4" /> Reject for correction</SecondaryButton></div>
    </Card>}

    <Card>
      <div className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /><h2 className="font-heading text-xl font-bold">Approval and version history</h2></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{[...(data.setup.approvedVersions || [])].reverse().map((version) => <article key={`${version.version}-${version.approvedAt}`} className="rounded-xl border border-border p-4"><div className="flex justify-between gap-3"><p className="font-bold">Approved version {version.version}</p><span className="text-xs font-semibold text-emerald-600">Immutable</span></div><p className="mt-2 text-sm">{version.effectiveMonth} → {version.expiryMonth || 'No expiry'}</p><p className="mt-1 text-xs text-muted-foreground">Approved by {version.approvedBy || 'Legacy migration'} · {displayDate(version.approvedAt)}</p><p className="mt-2 text-xs">{version.changeReason || 'No reason recorded'}</p></article>)}{!data.setup.approvedVersions?.length && <p className="text-sm text-muted-foreground">No setup has been approved yet.</p>}</div>
    </Card>

    <ConfirmActionDialog open={confirmAction === 'submit'} title="Submit setup for independent approval?" description="The draft will be locked. It will not affect payroll until a different authorized approver activates it." confirmLabel="Submit for approval" busy={busy === 'submit'} onClose={() => setConfirmAction('')} onConfirm={submit} />
    <ConfirmActionDialog open={confirmAction === 'approve'} title="Approve and activate this setup?" description="The approved version becomes immutable and all affected editable payroll batches will be updated in one transaction." confirmLabel="Approve and activate" busy={busy === 'approve'} onClose={() => setConfirmAction('')} onConfirm={() => decide('approve')} />
    <ConfirmActionDialog open={confirmAction === 'reject'} title="Reject this setup?" description="Finance will be able to correct the draft and submit it again." confirmLabel="Reject for correction" tone="danger" inputLabel="Rejection reason" required value={comments} onValueChange={setComments} confirmDisabled={comments.trim().length < 5} busy={busy === 'reject'} onClose={() => setConfirmAction('')} onConfirm={() => decide('reject')} />
    <ConfirmActionDialog open={confirmAction === 'open'} title="Open a new setup draft?" description="The current approved version remains active while Finance prepares a replacement." confirmLabel="Open new draft" inputLabel="Reason for opening the draft" required value={openDraftReason} onValueChange={setOpenDraftReason} confirmDisabled={openDraftReason.trim().length < 5} busy={busy === 'open'} onClose={() => setConfirmAction('')} onConfirm={openNewDraft} />
  </div>;
}

function ImpactCard({ impact, onRefresh, busy }) {
  return <Card className="border-primary/25 bg-primary/[.025]">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-2"><Eye className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-heading text-xl font-bold">Impact preview</h2><p className="text-sm text-muted-foreground">A read-only simulation; no payroll data is changed.</p></div></div><SecondaryButton disabled={busy} onClick={onRefresh}>{busy ? 'Calculating…' : 'Refresh impact'}</SecondaryButton></div>
    {impact ? <><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Editable batches" value={impact.affectedBatches} /><Metric label="Affected staff entries" value={impact.affectedStaffEntries} /><Metric label="Unique staff" value={impact.uniqueAffectedStaff} /><Metric label="Net salary change" value={money(impact.totals?.change?.netSalary)} /></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Delta label="Total income" before={impact.totals?.before?.income} after={impact.totals?.after?.income} /><Delta label="Total deductions" before={impact.totals?.before?.deductions} after={impact.totals?.after?.deductions} /><Delta label="Net salary" before={impact.totals?.before?.netSalary} after={impact.totals?.after?.netSalary} /></div></> : <p className="mt-4 text-sm text-muted-foreground">Save the draft to calculate its effect on editable payroll batches.</p>}
  </Card>;
}
const Metric = ({ label, value }) => <div className="rounded-lg border border-border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value ?? 0}</p></div>;
const Delta = ({ label, before, after }) => <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm">{money(before)} <span className="mx-1 text-primary">→</span> <b>{money(after)}</b></p></div>;
function MonthInput({ label, value, disabled, min, onChange }) {
  return <label><span className="mb-1 flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" />{label}</span><input type="month" className={input} min={min} disabled={disabled} value={value || ''} onChange={(event) => onChange(event.target.value)} /></label>;
}
function MoneyInput({ field, value, disabled, note = 'Applied to all active staff', onChange }) {
  return <label><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">{field.label}</span><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">GHS</span><input type="number" min="0" step="0.01" className={`${input} pl-12 text-right font-semibold`} disabled={disabled} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder="Leave blank to inherit" /></div><span className="mt-1 block text-[11px] text-muted-foreground">{note}</span></label>;
}
