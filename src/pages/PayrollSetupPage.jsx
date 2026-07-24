import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, Lock, LockOpen, Plus, Save, Trash2, UserRoundCog } from 'lucide-react';
import { getPayrollSetup, savePayrollSetup, setPayrollSetupLock } from '@/api/portalClient';
import { PageHeader, PrimaryButton } from '@/components/payroll/PageElements';
import ConfirmActionDialog from '@/components/ui/confirm-action-dialog';
import { toast } from '@/components/ui/use-toast';

const Card = ({ children, className = '', ...props }) => <section {...props} className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</section>;
const input = 'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60';
const emptyValues = (fields = []) => Object.fromEntries(fields.map(({ key }) => [key, '']));
const displayMoney = (value) => value === null || value === undefined || value === '' ? 'Uses bank-wide value' : new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value || 0));

export default function PayrollSetupPage() {
  const [data, setData] = useState(null);
  const [effectiveMonth, setEffectiveMonth] = useState('');
  const [globalValues, setGlobalValues] = useState({});
  const [overrides, setOverrides] = useState([]);
  const [reason, setReason] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [staffValues, setStaffValues] = useState({});
  const [staffReason, setStaffReason] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [lockAction, setLockAction] = useState(null);
  const [lockReason, setLockReason] = useState('');

  const hydrate = (response) => {
    setData(response);
    setEffectiveMonth(response.setup.effectiveMonth);
    setGlobalValues(Object.fromEntries(response.globalFields.map(({ key }) => [key, response.setup.globalValues?.[key] ?? ''])));
    setOverrides(response.setup.staffOverrides || []);
    setSelectedStaffId('');
    setStaffValues(emptyValues(response.staffFields));
    setStaffReason('');
  };
  const load = async () => {
    try {
      hydrate(await getPayrollSetup());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const staffById = useMemo(() => Object.fromEntries((data?.staff || []).map((staff) => [staff.id, staff])), [data?.staff]);
  const selectedOverride = overrides.find((item) => item.staffRecordId === selectedStaffId);
  const selectStaff = (staffId) => {
    setSelectedStaffId(staffId);
    const existing = overrides.find((item) => item.staffRecordId === staffId);
    setStaffValues(Object.fromEntries((data?.staffFields || []).map(({ key }) => [key, existing?.values?.[key] ?? ''])));
    setStaffReason(existing?.reason || '');
  };
  const addOverride = () => {
    if (!selectedStaffId) return toast.warning('Select a staff member first.', { title: 'Staff required' });
    if (staffReason.trim().length < 5) return toast.warning('Enter the reason for this staff-specific change.', { title: 'Reason required' });
    const values = Object.fromEntries(Object.entries(staffValues).map(([key, value]) => [key, value === '' ? null : Number(value)]));
    if (!Object.values(values).some((value) => value !== null)) return toast.warning('Enter at least one staff-specific amount.', { title: 'Amount required' });
    const next = { staffRecordId: selectedStaffId, values, reason: staffReason.trim() };
    setOverrides((current) => [...current.filter((item) => item.staffRecordId !== selectedStaffId), next]);
    toast.success(`${staffById[selectedStaffId]?.fullName || 'Staff'} is ready to be included when you save the setup.`, { title: selectedOverride ? 'Override updated' : 'Override added' });
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
    if (reason.trim().length < 5) return toast.warning('Enter an approved reason for the bank-wide setup change.', { title: 'Reason required' });
    setBusy('save');
    try {
      const response = await savePayrollSetup({
        effectiveMonth,
        globalValues: Object.fromEntries(Object.entries(globalValues).map(([key, value]) => [key, value === '' ? null : Number(value)])),
        staffOverrides: overrides,
        reason: reason.trim(),
      });
      hydrate(response);
      setReason('');
      setError('');
      toast.success(`${response.updatedStaffEntries || 0} staff entries across ${response.updatedBatches || 0} editable payroll batches were refreshed.`, { title: 'Salary and allowance setup saved' });
    } catch (err) {
      setError(err.message);
      toast.error(err.message, { title: 'Setup was not saved' });
    } finally {
      setBusy('');
    }
  };
  const changeLock = async () => {
    setBusy('lock');
    try {
      const response = await setPayrollSetupLock(lockAction === 'lock', lockReason.trim());
      hydrate(response);
      toast.success(lockAction === 'lock' ? 'Finance values are now protected from editing.' : 'Finance values can now be edited.', { title: lockAction === 'lock' ? 'Setup locked' : 'Setup unlocked' });
      setLockAction(null);
      setLockReason('');
    } catch (err) {
      setError(err.message);
      toast.error(err.message, { title: 'Lock status was not changed' });
    } finally {
      setBusy('');
    }
  };

  if (!data) return <Card>{error || 'Loading salary and allowance setup…'}</Card>;
  const locked = data.setup.locked;
  return <div className="space-y-6">
    <PageHeader
      title="Salary & Allowance Setup"
      description="Set recurring bank-wide amounts and controlled exceptions for individual staff before preparing payroll."
      actions={<button type="button" onClick={() => setLockAction(locked ? 'unlock' : 'lock')} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold ${locked ? 'border border-amber-500/40 text-amber-700 dark:text-amber-300' : 'bg-primary text-primary-foreground'}`}>{locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{locked ? 'Unlock setup' : 'Lock setup'}</button>}
    />
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>}
    <div className={`rounded-xl border p-4 text-sm ${locked ? 'border-amber-500/30 bg-amber-500/[.07]' : 'border-emerald-500/30 bg-emerald-500/[.06]'}`}>
      <p className="flex items-center gap-2 font-bold">{locked ? <Lock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{locked ? 'Setup is locked' : 'Setup is open for Finance changes'}</p>
      <p className="mt-1 text-muted-foreground">Changes apply automatically to new payrolls and editable drafts from the effective month. Submitted, approved, generated, and sent payrolls remain permanent.</p>
      {data.setup.updatedBy && <p className="mt-2 text-xs text-muted-foreground">Last updated by {data.setup.updatedBy} · {data.setup.updatedAt ? new Date(data.setup.updatedAt).toLocaleString() : 'No date recorded'}</p>}
    </div>

    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-heading text-xl font-bold">Bank-wide recurring values</h2><p className="text-sm text-muted-foreground">These amounts become the default for every active staff member. Leave a field blank only when Finance must enter it individually.</p></div>
        <label className="w-full sm:max-w-56"><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Effective month</span><input type="month" className={input} disabled={locked} value={effectiveMonth} onChange={(event) => setEffectiveMonth(event.target.value)} /></label>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.globalFields.map((field) => <MoneyInput key={field.key} field={field} value={globalValues[field.key]} disabled={locked} onChange={(value) => setGlobalValues((current) => ({ ...current, [field.key]: value }))} />)}
      </div>
    </Card>

    <Card id="staff-specific-editor">
      <div className="flex items-center gap-2"><UserRoundCog className="h-5 w-5 text-primary" /><div><h2 className="font-heading text-xl font-bold">Individual staff adjustment</h2><p className="text-sm text-muted-foreground">Use this only when one staff member’s salary, allowance, tax, or recurring deduction differs from the bank-wide value.</p></div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Staff member</span><select className={input} disabled={locked} value={selectedStaffId} onChange={(event) => selectStaff(event.target.value)}><option value="">Select active staff</option>{data.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.fullName} · {staff.staffId} · {staff.department}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Reason for this individual adjustment</span><input className={input} disabled={locked || !selectedStaffId} value={staffReason} onChange={(event) => setStaffReason(event.target.value)} placeholder="Example: Promotion effective August 2026" /></label>
      </div>
      {selectedStaffId && <><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.staffFields.map((field) => <MoneyInput key={field.key} field={field} value={staffValues[field.key]} disabled={locked} note={field.key === 'basicSalary' ? 'Staff-specific salary' : 'Blank uses the bank-wide value'} onChange={(value) => setStaffValues((current) => ({ ...current, [field.key]: value }))} />)}</div><PrimaryButton className="mt-5" disabled={locked} onClick={addOverride}><Plus className="h-4 w-4" />{selectedOverride ? 'Update staff adjustment' : 'Add staff adjustment'}</PrimaryButton></>}
    </Card>

    <Card>
      <h2 className="font-heading text-xl font-bold">Saved individual adjustments</h2>
      <p className="text-sm text-muted-foreground">{overrides.length} staff member{overrides.length === 1 ? '' : 's'} currently have controlled exceptions.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{overrides.map((item) => {
        const staff = staffById[item.staffRecordId] || {};
        const values = Object.entries(item.values || {}).filter(([, value]) => value !== null && value !== '');
        return <article key={item.staffRecordId} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{staff.fullName || item.staffRecordId}</p><p className="text-xs text-muted-foreground">{staff.staffId} · {staff.department} · {staff.branch}</p></div><div className="flex gap-1"><button disabled={locked} onClick={() => editOverride(item)} className="grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40" aria-label={`Edit ${staff.fullName || 'staff'} adjustment`}><Edit3 className="h-4 w-4" /></button><button disabled={locked} onClick={() => removeOverride(item.staffRecordId)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-red-600 hover:bg-red-500/10 disabled:opacity-40" aria-label={`Remove ${staff.fullName || 'staff'} adjustment`}><Trash2 className="h-4 w-4" /></button></div></div><div className="mt-3 grid grid-cols-2 gap-2">{values.map(([key, value]) => <div key={key} className="rounded-lg bg-muted/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">{data.staffFields.find((field) => field.key === key)?.label || key}</p><p className="text-xs font-bold">{displayMoney(value)}</p></div>)}</div><p className="mt-3 text-xs text-muted-foreground"><b>Reason:</b> {item.reason}</p></article>;
      })}{!overrides.length && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:col-span-2">No staff-specific adjustments have been added.</div>}</div>
    </Card>

    <Card className="sticky bottom-20 z-20 shadow-xl lg:bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><label className="flex-1"><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Approved reason for saving this setup</span><input className={input} disabled={locked} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the approved bank-wide change" /></label><PrimaryButton disabled={locked || busy === 'save'} onClick={save}><Save className="h-4 w-4" />{busy === 'save' ? 'Saving…' : 'Save and apply setup'}</PrimaryButton></div>
    </Card>

    <ConfirmActionDialog open={Boolean(lockAction)} title={`${lockAction === 'lock' ? 'Lock' : 'Unlock'} salary and allowance setup?`} description={lockAction === 'lock' ? 'Finance will not be able to edit bank-wide values or individual adjustments until the setup is formally unlocked.' : 'Unlocking permits Finance to change values that can update new and editable payroll batches.'} confirmLabel={lockAction === 'lock' ? 'Lock setup' : 'Unlock setup'} tone={lockAction === 'unlock' ? 'danger' : 'default'} inputLabel="Approved reason" inputPlaceholder="Enter the reason for this action" required value={lockReason} onValueChange={setLockReason} confirmDisabled={lockReason.trim().length < 5} busy={busy === 'lock'} onClose={() => { setLockAction(null); setLockReason(''); }} onConfirm={changeLock} />
  </div>;
}

function MoneyInput({ field, value, disabled, note = 'Applied to all active staff', onChange }) {
  return <label><span className="mb-1 block text-xs font-bold uppercase text-muted-foreground">{field.label}</span><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">GHS</span><input type="number" min="0" step="0.01" className={`${input} pl-12 text-right font-semibold`} disabled={disabled} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder="Leave blank to inherit" /></div><span className="mt-1 block text-[11px] text-muted-foreground">{note}</span></label>;
}
