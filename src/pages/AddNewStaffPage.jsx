import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { createStaffRecord, getPortalSettings } from '@/api/portalClient';
import { PageHeader, PrimaryButton, SecondaryButton } from '@/components/payroll/PageElements';
import { toast } from '@/components/ui/use-toast';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</section>;
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const emptyForm = { fullName: '', staffId: '', department: '', position: '', branch: '', phone: '', email: '', employmentStatus: 'active', reason: 'New staff onboarding' };

export default function AddNewStaffPage() {
  const navigate = useNavigate();
  const [organization, setOrganization] = useState({ branches: [], departments: [] });
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { getPortalSettings().then((settings) => setOrganization({ branches: settings.branches || [], departments: settings.departments || [] })).catch((err) => setError(err.message)); }, []);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => { event.preventDefault(); setSaving(true); try { await createStaffRecord(form); toast.success(`${form.fullName} was added to the active staff directory.`, { title: 'Staff member added' }); navigate('/staff', { replace: true }); } catch (err) { toast.error(err.message, { title: 'Staff member was not added' }); } finally { setSaving(false); } };
  return <div className="space-y-6"><PageHeader title="Add New Staff" description="Add a new employee to the directory and future payslip list." />{error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}<Card className="max-w-4xl"><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><Field label="Staff name"><input className={inputClass} value={form.fullName} onChange={(event) => update('fullName', event.target.value)} required /></Field><Field label="Staff ID"><input className={inputClass} value={form.staffId} onChange={(event) => update('staffId', event.target.value)} required /></Field><Field label="Official email"><input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="name@bawjiasecommunitybank.com" required /></Field><Field label="Phone number"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></Field><Field label="Department"><select className={inputClass} value={form.department} onChange={(event) => update('department', event.target.value)} required><option value="">Select department</option>{organization.departments.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Position"><input className={inputClass} value={form.position} onChange={(event) => update('position', event.target.value)} required /></Field><Field label="Branch"><select className={inputClass} value={form.branch} onChange={(event) => update('branch', event.target.value)} required><option value="">Select branch</option>{organization.branches.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Employment status"><select className={inputClass} value={form.employmentStatus} onChange={(event) => update('employmentStatus', event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field><Field label="Reason for addition" className="sm:col-span-2"><textarea className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" value={form.reason} onChange={(event) => update('reason', event.target.value)} required /></Field><div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row"><Link to="/staff"><SecondaryButton className="w-full sm:w-auto" type="button">Cancel</SecondaryButton></Link><PrimaryButton className="w-full sm:w-auto" disabled={saving} type="submit"><UserPlus className="h-4 w-4" />{saving ? 'Saving…' : 'Save staff record'}</PrimaryButton></div></form></Card></div>;
}

function Field({ label, children, className = '' }) { return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>; }
