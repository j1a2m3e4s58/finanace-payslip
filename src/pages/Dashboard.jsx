import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BadgeDollarSign, CalendarDays, Check, Clock3, FileCheck2, MailCheck, MailX, Plus, ReceiptText, RefreshCcw, Send, ShieldCheck, Upload, UserCheck, UserMinus, UsersRound, WalletCards } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getReportingDashboard } from '@/api/portalClient';
import MetricCard from '@/components/dashboard/MetricCard';
import { PageHeader, StatusBadge } from '@/components/payroll/PageElements';
import { useAuth } from '@/lib/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

const money = (value) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(Number(value || 0));
const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</section>;
const chartColors = ['#08724a', '#c99a2e', '#dc2626'];
const workflowSteps = ['Draft', 'Submitted', 'Approved', 'Generated', 'Sent'];
const quickActions = [
  { label: 'Add user', note: 'Create a secure system account', icon: UsersRound, path: '/users', permission: 'users.manage' },
  { label: 'Add new staff', note: 'Create an employee record', icon: Plus, path: '/staff/new', permission: 'staff.manage' },
  { label: 'Upload staff emails', note: 'Import CSV or Excel records', icon: Upload, path: '/staff/upload-emails', permission: 'staff.manage' },
  { label: 'Prepare payroll', note: 'Open monthly salary entry', icon: WalletCards, path: '/payroll/batches', permission: 'payroll.prepare' },
  { label: 'Send payslips', note: 'Email approved payslips', icon: Send, path: '/payslips/send', permission: 'payslips.send' },
];

export default function Dashboard() {
  const { can } = useAuth();
  const isMobile = useIsMobile();
  const chartHeight = isMobile ? 210 : 270;
  const [data, setData] = useState({ metrics: {}, charts: {}, recentBatches: [], warnings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getReportingDashboard()); setError(''); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const m = data.metrics || {};
  const metrics = useMemo(() => [
    { label: 'Active Staff', value: m.activeStaff || 0, icon: UserCheck, color: 'emerald', to: can('staff.view') ? '/staff?status=active' : null },
    { label: 'Inactive Staff', value: m.inactiveStaff || 0, icon: UserMinus, color: 'amber', to: can('staff.view') ? '/staff?status=inactive' : null },
    { label: 'Current Payroll', value: m.currentBatch || 'None', icon: CalendarDays, color: 'cyan', sublabel: statusLabel(m.currentBatchStatus), to: can('payroll.view') ? '/payroll/batches' : null },
    { label: 'Total Income', value: money(m.totalIncome), icon: WalletCards, color: 'emerald', to: can('payroll.view') ? '/payroll/batches' : null },
    { label: 'Total Deductions', value: money(m.totalDeductions), icon: ReceiptText, color: 'orange', to: can('payroll.view') ? '/payroll/batches' : null },
    { label: 'Net Salary', value: money(m.totalNetSalary), icon: BadgeDollarSign, color: 'emerald', to: can('payroll.view') ? '/payroll/batches' : null },
    { label: 'Successful Emails', value: m.successfulEmails || 0, icon: MailCheck, color: 'cyan', to: can('payslips.send') ? '/payslips/send' : null },
    { label: 'Failed Emails', value: m.failedEmails || 0, icon: MailX, color: 'red', to: can('payslips.send') ? '/payslips/send' : null },
    { label: 'Pending Emails', value: m.pendingEmails || 0, icon: Clock3, color: 'amber', to: can('payslips.send') ? '/payslips/send' : null },
    { label: 'Corrected Payslips', value: m.correctedPayslips || 0, icon: FileCheck2, color: 'purple', to: can('salary.view') ? '/salary-history' : null },
  ], [m, can]);
  const currentStep = workflowIndex(m.currentBatchStatus);
  const refreshedAt = data.refreshedAt ? new Date(data.refreshedAt) : null;
  const canOpenWarning = (href) => href === '/staff' ? can('staff.view') : href === '/payslips/send' ? can('payslips.send') : can('payroll.view');

  return <div className="space-y-6">
    <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 p-5 text-white shadow-xl shadow-emerald-950/10 lg:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-amber-300">Bawjiase Community Bank</p><h1 className="mt-2 font-heading text-2xl font-bold lg:text-3xl">Finance Payslip Dashboard</h1><p className="mt-2 max-w-xl text-sm text-emerald-100">Live payroll, salary-change, and private email delivery intelligence for management.</p><div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-emerald-100"><span>Last refreshed: {refreshedAt ? refreshedAt.toLocaleString('en-GB') : loading ? 'Loading...' : 'Unavailable'}</span><button type="button" disabled={loading} onClick={load} className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 font-semibold hover:bg-white/10 disabled:opacity-50"><RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div></div><div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur"><ShieldCheck className="h-7 w-7 text-amber-300" /><div><p className="text-xs text-emerald-100">Current payroll</p><p className="font-semibold">{m.currentBatch || 'No payroll batch'}</p><p className="text-xs text-emerald-100">{statusLabel(m.currentBatchStatus)}</p></div></div></div></div>
    {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}

    {(data.warnings || []).length > 0 && <section className="space-y-3"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h2 className="font-heading text-lg font-bold">Priority attention</h2></div><div className="grid gap-3 lg:grid-cols-2">{data.warnings.map((warning) => { const warningCard = <div className={`flex h-full items-start gap-3 rounded-xl border p-4 ${warning.severity === 'critical' ? 'border-red-500/35 bg-red-500/[.06]' : 'border-amber-500/35 bg-amber-500/[.06]'}`}><AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${warning.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`} /><div className="min-w-0 flex-1"><p className="font-semibold">{warning.title}</p><p className="mt-1 text-xs text-muted-foreground">{warning.message}</p></div>{canOpenWarning(warning.href) && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}</div>; return canOpenWarning(warning.href) ? <Link key={warning.id} to={warning.href}>{warningCard}</Link> : <div key={warning.id}>{warningCard}</div>; })}</div></section>}

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} loading={loading} />)}</div>

    <Card><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-lg font-bold">Payroll workflow</h2><p className="text-sm text-muted-foreground">Visible progress for the current monthly payroll.</p></div><StatusBadge status={statusLabel(m.currentBatchStatus)} /></div><div className="mt-5 grid grid-cols-5 gap-1 sm:gap-3">{workflowSteps.map((step, index) => { const complete = currentStep > index; const active = currentStep === index; return <div key={step} className="relative text-center"><div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold sm:h-11 sm:w-11 ${complete ? 'border-emerald-600 bg-emerald-600 text-white' : active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/30 text-muted-foreground'}`}>{complete ? <Check className="h-4 w-4" /> : index + 1}</div><p className={`mt-2 text-[10px] font-semibold sm:text-xs ${active ? 'text-primary' : complete ? 'text-emerald-600' : 'text-muted-foreground'}`}>{step}</p>{index < workflowSteps.length - 1 && <span className={`absolute left-[calc(50%+1.4rem)] right-[calc(-50%+1.4rem)] top-4 h-0.5 sm:top-5 ${currentStep > index ? 'bg-emerald-600' : 'bg-border'}`} />}</div>; })}</div>{['rejected', 'corrected'].includes(m.currentBatchStatus) && <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">This payroll has been returned for correction and must be resubmitted before approval.</p>}</Card>

    <div className="grid gap-5 xl:grid-cols-2"><ChartCard title="Monthly Payroll Trends" note="Income, deductions, and net salary by payroll month"><ResponsiveContainer width="100%" height={chartHeight}><LineChart data={data.charts?.monthlyPayroll || []}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="period" fontSize={11} /><YAxis tickFormatter={compactMoney} fontSize={11} width={isMobile ? 46 : 60} /><Tooltip formatter={(value) => money(value)} /><Legend /><Line type="monotone" dataKey="income" name="Income" stroke="#08724a" strokeWidth={2.5} /><Line type="monotone" dataKey="deductions" name="Deductions" stroke="#c99a2e" strokeWidth={2} /><Line type="monotone" dataKey="net" name="Net Salary" stroke="#2563eb" strokeWidth={2.5} /></LineChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Department Payroll Cost" note="Current payroll income cost by department"><ResponsiveContainer width="100%" height={chartHeight}><BarChart data={data.charts?.departmentCost || []} layout="vertical" margin={{ left: isMobile ? 0 : 20 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" tickFormatter={compactMoney} fontSize={11} /><YAxis type="category" dataKey="department" width={isMobile ? 78 : 110} fontSize={isMobile ? 9 : 11} /><Tooltip formatter={(value) => money(value)} /><Bar dataKey="cost" name="Payroll Cost" fill="#08724a" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Email Delivery Success" note="Current private payslip delivery outcomes"><ResponsiveContainer width="100%" height={chartHeight}><PieChart><Pie data={data.charts?.emailDelivery || []} dataKey="count" nameKey="status" innerRadius={isMobile ? 42 : 55} outerRadius={isMobile ? 68 : 88} paddingAngle={3}>{(data.charts?.emailDelivery || []).map((entry, index) => <Cell key={entry.status} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Salary Change Summary" note="Tracked salary-field changes by effective month"><ResponsiveContainer width="100%" height={chartHeight}><BarChart data={data.charts?.salaryChanges || []}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="period" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="count" name="Salary Changes" fill="#c99a2e" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard></div>

    <div className="grid gap-5 xl:grid-cols-[1.35fr,.85fr]"><Card><PageHeader eyebrow="Monthly processing" title="Recent payroll batches" description="Latest saved payroll versions and processing status." actions={<Link to="/payroll/batches" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">View all <ArrowRight className="h-4 w-4" /></Link>} /><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted-foreground"><tr><th className="pb-3">Payroll</th><th className="pb-3">Staff</th><th className="pb-3">Income</th><th className="pb-3">Net Salary</th><th className="pb-3">Status</th></tr></thead><tbody>{data.recentBatches?.map((batch) => <tr key={batch.id} className="border-b border-border/60 last:border-0"><td className="py-3 font-semibold"><Link to="/payroll/batches" className="hover:text-primary">{batch.name}</Link></td><td>{batch.summary?.staffCount || batch.entries?.length || 0}</td><td>{money(batch.summary?.totalIncome)}</td><td className="font-semibold text-primary">{money(batch.summary?.totalNetSalary)}</td><td><StatusBadge status={statusLabel(batch.status)} /></td></tr>)}</tbody></table>{!data.recentBatches?.length && <p className="py-8 text-center text-sm text-muted-foreground">No payroll batch has been created yet.</p>}</div></Card><Card><h2 className="font-heading text-lg font-bold">Quick actions</h2><p className="mt-1 text-sm text-muted-foreground">Tasks available for your assigned role.</p><div className="mt-4 space-y-2">{quickActions.filter((item) => can(item.permission)).map(({ label, note, icon: Icon, path }) => <Link key={path} to={path} className="flex items-center gap-3 rounded-xl border border-border/70 p-3 transition hover:border-primary/30 hover:bg-primary/5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block truncate text-xs text-muted-foreground">{note}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div></Card></div>
  </div>;
}

function ChartCard({ title, note, children }) { return <Card className="overflow-hidden"><h2 className="font-heading text-lg font-bold">{title}</h2><p className="mb-4 mt-1 text-sm text-muted-foreground">{note}</p>{children}</Card>; }
function compactMoney(value) { return `GHS ${Number(value || 0) >= 1000 ? `${(Number(value) / 1000).toFixed(0)}k` : Number(value || 0)}`; }
function statusLabel(status) { return ({ draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', corrected: 'Corrected', generated: 'Generated', partially_sent: 'Partially Sent', sent: 'Sent', none: 'No Batch' })[status] || status || 'No Batch'; }
function workflowIndex(status) { return ({ draft: 0, rejected: 0, corrected: 0, submitted: 1, approved: 2, generated: 3, partially_sent: 4, sent: 4 })[status] ?? -1; }
