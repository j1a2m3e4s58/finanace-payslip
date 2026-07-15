import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock3, History } from 'lucide-react';
import { getSalaryHistory, getStaffDirectory } from '@/api/portalClient';
import { EmptyHint, PageHeader, StatusBadge } from '@/components/payroll/PageElements';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</section>;
const money = (value) => value === null || value === undefined ? 'Not set' : new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value));

export default function SalaryHistoryPage() {
  const [params, setParams] = useSearchParams();
  const [staff, setStaff] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const staffId = params.get('staff') || '';
  useEffect(() => { getStaffDirectory().then(setStaff).catch((err) => setError(err.message)); }, []);
  useEffect(() => { getSalaryHistory(staffId).then(setHistory).catch((err) => setError(err.message)); }, [staffId]);
  const selected = staff.find((item) => item.id === staffId);
  const grouped = useMemo(() => Object.values(history.reduce((groups, item) => { const key = `${item.batchId}-${item.staffRecordId}`; if (!groups[key]) groups[key] = { key, name: item.staffName, staffId: item.staffId, month: item.effectiveMonth, batch: item.batchName, version: item.version, changedBy: item.changedBy, changedAt: item.changedAt, reason: item.reason, approvalStatus: item.approvalStatus, changes: [] }; groups[key].changes.push(item); return groups; }, {})), [history]);
  return <div className="space-y-6"><PageHeader title="Salary Change History" description="Permanent old-and-new value records for copied payrolls, monthly changes, and revised payslips." />
    {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}
    <Card><label className="block text-xs font-bold uppercase text-muted-foreground">Staff profile</label><select className="mt-2 h-10 w-full max-w-xl rounded-lg border border-border bg-background px-3 text-sm" value={staffId} onChange={(e) => setParams(e.target.value ? { staff: e.target.value } : {})}><option value="">All staff salary changes</option>{staff.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.staffId}</option>)}</select>{selected && <div className="mt-4 flex items-center gap-3 rounded-lg bg-primary/[.04] p-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{selected.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><p className="font-semibold">{selected.fullName}</p><p className="text-xs text-muted-foreground">{selected.staffId} · {selected.department} · {selected.branch}</p></div></div>}</Card>
    <div className="space-y-4">{grouped.map((group) => <Card key={group.key}><div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><History className="h-5 w-5" /></span><div><h2 className="font-heading text-lg font-bold">{group.name} · {formatMonth(group.month)}</h2><p className="text-xs text-muted-foreground">{group.batch} · Version {group.version || 1}</p><p className="mt-1 text-sm"><b>Reason:</b> {group.reason}</p></div></div><StatusBadge status={group.approvalStatus === 'approved' ? 'Approved' : 'Pending Approval'} /></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Salary field</th><th className="pb-2">Old value</th><th className="pb-2">New value</th><th className="pb-2">Difference</th></tr></thead><tbody>{group.changes.map((change) => <tr key={change.id} className="border-t border-border/60"><td className="py-2 font-semibold">{change.fieldLabel}</td><td>{money(change.oldValue)}</td><td>{money(change.newValue)}</td><td className={Number(change.newValue || 0) - Number(change.oldValue || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}>{money(Number(change.newValue || 0) - Number(change.oldValue || 0))}</td></tr>)}</tbody></table></div><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" />Changed by {group.changedBy} on {new Date(group.changedAt).toLocaleString()}</div></Card>)}{!grouped.length && <Card><EmptyHint>{staffId ? 'No salary changes have been recorded for this staff member.' : 'No salary change history has been recorded yet.'}</EmptyHint></Card>}</div>
  </div>;
}

function formatMonth(period) { if (!period) return 'Unknown month'; return new Date(`${period}-01T00:00:00`).toLocaleString('en-GB', { month: 'long', year: 'numeric' }); }
