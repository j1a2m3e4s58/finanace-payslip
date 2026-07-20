import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, Clock3, Mail, MailCheck, MailX, RefreshCcw, Save, Send, Server, ShieldCheck, XCircle } from 'lucide-react';
import { getPayrollBatches, getPayslipEmailDelivery, resendFailedPayslipEmails, savePayslipEmailTemplate, sendAllPayslipEmails, sendPayslipTestEmail } from '@/api/portalClient';
import { EmptyHint, PageHeader, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/payroll/PageElements';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';
import ConfirmActionDialog from '@/components/ui/confirm-action-dialog';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</section>;
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const deliverableStatuses = ['approved', 'generated', 'partially_sent', 'sent'];
const emptyDelivery = { deliveries: [], template: { subject: '', body: '' }, recipientIssues: [], mailConfigured: false, provider: '', requireTestEmail: true, testEmailSentAt: null };

function useDeliveryWorkspace(requestedId) {
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [delivery, setDelivery] = useState(emptyDelivery);
  const [error, setError] = useState('');
  const loadBatches = useCallback(async () => {
    const rows = (await getPayrollBatches()).filter((batch) => deliverableStatuses.includes(batch.status));
    setBatches(rows);
    setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows.some((row) => row.id === requestedId) ? requestedId : rows[0]?.id || '');
  }, [requestedId]);
  const refresh = useCallback(async () => {
    if (!selectedId) { setDelivery(emptyDelivery); return; }
    try { setDelivery(await getPayslipEmailDelivery(selectedId)); setError(''); }
    catch (err) { setError(err.message); }
  }, [selectedId]);
  useEffect(() => { loadBatches().catch((err) => setError(err.message)); }, [loadBatches]);
  useEffect(() => { setDelivery(emptyDelivery); refresh(); }, [refresh]);
  const active = delivery.deliveries.some((item) => ['Pending', 'Sending', 'Retried'].includes(item.status));
  useEffect(() => { if (!active) return undefined; const timer = window.setInterval(refresh, 1500); return () => window.clearInterval(timer); }, [active, refresh]);
  return { batches, selectedId, setSelectedId, batch: batches.find((item) => item.id === selectedId), delivery, setDelivery, error, setError, refresh, loadBatches, active };
}

export default function SendPayslipsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const workspace = useDeliveryWorkspace(searchParams.get('batch') || '');
  const { batches, selectedId, setSelectedId, batch, delivery, setDelivery, error, setError, refresh, loadBatches, active } = workspace;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testEmail, setTestEmail] = useState(user?.email || '');
  const [busy, setBusy] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  const [acknowledged, setAcknowledged] = useState({ recipients: false, message: false, authority: false });

  useEffect(() => { setSubject(delivery.template?.subject || ''); setBody(delivery.template?.body || ''); }, [delivery.template]);
  useEffect(() => { setAcknowledged({ recipients: false, message: false, authority: false }); setConfirmSend(false); }, [selectedId]);
  const logs = useMemo(() => delivery.deliveries.filter((item) => !item.isTest), [delivery.deliveries]);
  const summary = useMemo(() => deliverySummary(logs), [logs]);
  const blockedKeys = new Set(delivery.recipientIssues.map((item) => item.staffRecordId || item.staffId || item.email));
  const blocked = blockedKeys.size;
  const totalStaff = batch?.entries?.length || 0;
  const receiving = Math.max(0, totalStaff - blocked);
  const testSatisfied = !delivery.requireTestEmail || Boolean(delivery.testEmailSentAt);
  const automatedChecks = [
    { id: 'batch', label: 'An approved payroll batch is selected', passed: Boolean(batch && ['approved', 'generated'].includes(batch.status)) },
    { id: 'provider', label: 'Secure email provider is configured', passed: Boolean(delivery.mailConfigured) },
    { id: 'recipients', label: 'Every active recipient has one valid, unique email', passed: Boolean(batch && blocked === 0) },
    { id: 'template', label: 'Email subject and message are complete', passed: Boolean(subject.trim() && body.trim()) },
    { id: 'test', label: delivery.requireTestEmail ? 'Required test email was sent successfully' : 'Test email is optional under current policy', passed: testSatisfied },
    { id: 'new-run', label: 'This batch has not already been sent', passed: logs.length === 0 },
  ];
  const automatedReady = automatedChecks.every((item) => item.passed);
  const manualReady = Object.values(acknowledged).every(Boolean);
  const canSend = automatedReady && manualReady && receiving > 0;

  const saveTemplate = async () => {
    setBusy('save');
    try {
      const template = await savePayslipEmailTemplate(selectedId, subject, body);
      setDelivery((current) => ({ ...current, template })); setError('');
      toast.success('The subject and message body are ready for this payroll.', { title: 'Email template saved' });
    } catch (err) { toast.error(err.message, { title: 'Template was not saved' }); }
    finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test');
    try {
      await savePayslipEmailTemplate(selectedId, subject, body);
      const result = await sendPayslipTestEmail(selectedId, { email: testEmail, subject, body });
      setError(''); toast.success(result.message, { title: 'Test email sent' }); await refresh();
    } catch (err) { toast.error(err.message, { title: 'Test email failed' }); }
    finally { setBusy(''); }
  };
  const sendAll = async () => {
    setBusy('send');
    try {
      await savePayslipEmailTemplate(selectedId, subject, body);
      const result = await sendAllPayslipEmails(selectedId);
      setConfirmSend(false);
      toast.success(`${result.queued} private payslip emails entered the secure queue.`, { title: 'Bulk delivery started' });
      await refresh(); await loadBatches();
    } catch (err) { toast.error(err.message, { title: 'Payslips were not queued' }); }
    finally { setBusy(''); }
  };
  const retry = async () => {
    setBusy('retry');
    try {
      const result = await resendFailedPayslipEmails(selectedId);
      toast.warning(`${result.queued} failed or bounced emails were queued again. Successful emails were not resent.`, { title: 'Failed-only retry started' });
      await refresh();
    } catch (err) { toast.error(err.message, { title: 'Retry failed' }); }
    finally { setBusy(''); }
  };

  return <div className="space-y-6">
    <PageHeader title="Send Payslips" description="Verify the batch, then queue one private, password-protected payslip email for each eligible staff member." />
    {error && <Banner tone="red">{error}</Banner>}
    <div className="grid gap-5 lg:grid-cols-[1.2fr,.8fr]"><Card><label className="text-xs font-bold uppercase text-muted-foreground">Approved payroll batch</label><select className={`${inputClass} mt-2`} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Select payroll</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.name} · Version {item.version || 1} · {statusLabel(item.status)}</option>)}</select>{batch && <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-primary/[.04] p-4 sm:grid-cols-4"><Info label="Total staff" value={totalStaff} /><Info label="Will receive" value={receiving} tone="green" /><Info label="Blocked" value={blocked} tone={blocked ? 'red' : 'green'} /><div><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><StatusBadge status={statusLabel(batch.status)} /></div></div></div>}</Card><Card><div className="flex items-center gap-2"><Server className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">Email provider</h2></div><p className="mt-3 text-sm font-semibold">{delivery.provider || 'Select a payroll to check SMTP'}</p><p className="mt-2 text-xs text-muted-foreground">Credentials remain on the server and are never returned to this page.</p><div className="mt-3"><StatusBadge status={delivery.mailConfigured ? 'Ready' : 'Not Configured'} /></div></Card></div>
    {delivery.recipientIssues.length > 0 && <Card className="border-red-500/30 bg-red-500/[.03]"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" /><div><h2 className="font-bold text-red-700 dark:text-red-400">{blocked} staff member{blocked === 1 ? '' : 's'} blocked from delivery</h2><p className="mt-1 text-sm text-muted-foreground">Correct these records before the full batch can be sent.</p><div className="mt-3 space-y-1 text-sm">{delivery.recipientIssues.map((item) => <p key={`${item.staffRecordId}-${item.issue}`}><b>{item.fullName}</b> ({item.staffId}): {item.issue}</p>)}</div></div></div></Card>}
    <div className="grid gap-5 xl:grid-cols-[1fr,.8fr]"><Card><div className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">Email template</h2></div><p className="mt-1 text-xs text-muted-foreground">Available fields: {'{staff_name}'}, {'{month}'}, {'{year}'}</p><label className="mt-4 block text-sm font-semibold">Subject<input className={`${inputClass} mt-1.5`} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label className="mt-4 block text-sm font-semibold">Message body<textarea className="mt-1.5 min-h-52 w-full rounded-lg border border-border bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-primary/25" value={body} onChange={(event) => setBody(event.target.value)} /></label><SecondaryButton className="mt-4" disabled={!batch || Boolean(busy)} onClick={saveTemplate}><Save className="h-4 w-4" /> {busy === 'save' ? 'Saving…' : 'Save Template'}</SecondaryButton></Card><Card><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">Test private delivery</h2></div><p className="mt-2 text-sm text-muted-foreground">The test confirms the SMTP provider, message format, PDF generation, and attachment protection before bulk sending.</p><label className="mt-5 block text-sm font-semibold">Test recipient<input className={`${inputClass} mt-1.5`} type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="finance@bawjiasecommunitybank.com" /></label><SecondaryButton className="mt-3 w-full" disabled={!batch || !delivery.mailConfigured || !testEmail || Boolean(busy)} onClick={test}><Mail className="h-4 w-4" /> {busy === 'test' ? 'Sending Test…' : 'Send Test Email'}</SecondaryButton><div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs">{testSatisfied ? <span className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />Test requirement satisfied</span> : <span className="flex items-center gap-2 font-semibold text-red-600"><XCircle className="h-4 w-4" />A successful test email is required</span>}</div></Card></div>
    <Card className="border-primary/25"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-heading text-xl font-bold">Mandatory pre-send checklist</h2><p className="mt-1 text-sm text-muted-foreground">All automatic controls and finance confirmations must pass before Send All is enabled.</p></div><div className="flex gap-2"><StatusPill label={`${receiving} receiving`} tone="green" /><StatusPill label={`${blocked} blocked`} tone={blocked ? 'red' : 'green'} /></div></div><div className="mt-5 grid gap-2 lg:grid-cols-2">{automatedChecks.map((item) => <ChecklistItem key={item.id} label={item.label} checked={item.passed} automatic />)}<ManualCheck label="I reviewed the staff recipient list and blocked count." checked={acknowledged.recipients} onChange={(checked) => setAcknowledged((current) => ({ ...current, recipients: checked }))} /><ManualCheck label="I reviewed the subject, message, period, and payslip version." checked={acknowledged.message} onChange={(checked) => setAcknowledged((current) => ({ ...current, message: checked }))} /><ManualCheck label="I am authorized to send this full payroll batch." checked={acknowledged.authority} onChange={(checked) => setAcknowledged((current) => ({ ...current, authority: checked }))} /></div><div className="mt-5 border-t border-border pt-4"><PrimaryButton className="w-full sm:w-auto" disabled={!canSend || Boolean(busy)} onClick={() => setConfirmSend(true)}><Send className="h-4 w-4" /> Send All Payslips ({receiving})</PrimaryButton>{!canSend && <p className="mt-2 text-xs text-muted-foreground">Complete every checklist item to enable full-batch sending.</p>}</div></Card>
    {logs.length > 0 && <><QueueProgress summary={summary} active={active} /><DeliverySummary summary={summary} /><RetryFailedPanel failed={summary.failed + summary.bounced} busy={busy} retry={retry} /></>}
    <DeliveryLogTable logs={logs} />
    <ConfirmActionDialog open={confirmSend} title="Send the full payslip batch?" description={`This will queue ${receiving} private emails. Each eligible staff member will receive only their own password-protected payslip.`} confirmLabel={`Send ${receiving} payslips`} busy={busy === 'send'} onClose={() => setConfirmSend(false)} onConfirm={sendAll}><div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm"><p className="flex justify-between"><span className="text-muted-foreground">Payroll</span><b>{batch?.name}</b></p><p className="flex justify-between"><span className="text-muted-foreground">Version</span><b>{batch?.version || 1}</b></p><p className="flex justify-between"><span className="text-muted-foreground">Private recipients</span><b>{receiving}</b></p><p className="flex justify-between"><span className="text-muted-foreground">Blocked recipients</span><b className={blocked ? 'text-red-600' : 'text-emerald-600'}>{blocked}</b></p></div></ConfirmActionDialog>
  </div>;
}

function QueueProgress({ summary, active }) {
  const processed = summary.sent + summary.failed + summary.bounced;
  const percent = summary.total ? Math.min(100, Math.round((processed / summary.total) * 100)) : 0;
  return <Card className="border-cyan-500/25"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Clock3 className={`h-5 w-5 text-cyan-600 ${active ? 'animate-pulse' : ''}`} /><h2 className="font-heading text-lg font-bold">Bulk email queue progress</h2></div><p className="mt-1 text-sm text-muted-foreground">{processed} of {summary.total} emails processed</p></div><StatusBadge status={active ? 'Sending' : summary.pending ? 'Pending' : 'Completed'} /></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-500 transition-all duration-500" style={{ width: `${percent}%` }} /></div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{percent}% complete</span><span>{summary.pending} remaining</span></div></Card>;
}

function DeliverySummary({ summary }) { return <Card><div className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">Final delivery summary</h2></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><SummaryMetric label="Sent" value={summary.sent} icon={MailCheck} tone="green" /><SummaryMetric label="Failed" value={summary.failed} icon={MailX} tone="red" /><SummaryMetric label="Pending" value={summary.pending} icon={Clock3} tone="amber" /><SummaryMetric label="Bounced" value={summary.bounced} icon={RefreshCcw} tone="red" /></div></Card>; }
function RetryFailedPanel({ failed, busy, retry }) { return <Card className="border-red-500/20"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-lg font-bold">Failed delivery recovery</h2><p className="mt-1 text-sm text-muted-foreground">This action retries only failed or bounced messages. Successfully sent payslips are excluded.</p></div><SecondaryButton disabled={!failed || Boolean(busy)} onClick={retry}><RefreshCcw className="h-4 w-4" /> {busy === 'retry' ? 'Queueing Failed…' : `Resend Failed Only (${failed})`}</SecondaryButton></div></Card>; }

function DeliveryLogTable({ logs }) {
  return <Card><h2 className="font-heading text-lg font-bold">Individual email delivery records</h2><div className="mt-4 grid gap-3 md:hidden">{logs.map((item) => <article key={item.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.staffName}</p><p className="truncate text-xs text-muted-foreground">{item.recipientEmail}</p></div><StatusBadge status={item.status} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><p><span className="text-muted-foreground">Attempts</span><br /><b>{item.attempts || 1}</b></p><p><span className="text-muted-foreground">Sent</span><br /><b>{item.sentAt ? new Date(item.sentAt).toLocaleString('en-GB') : '—'}</b></p></div>{item.errorMessage && <p className="mt-3 text-xs text-red-600">{item.errorMessage}</p>}</article>)}{!logs.length && <EmptyHint>No payslip emails have been queued for this payroll.</EmptyHint>}</div><div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted-foreground"><tr><th className="pb-3">Staff member</th><th className="pb-3">Recipient</th><th className="pb-3">Status</th><th className="pb-3">Sent time</th><th className="pb-3">Attempts</th><th className="pb-3">Error</th></tr></thead><tbody>{logs.map((item) => <tr key={item.id} className="border-b border-border/60 last:border-0"><td className="py-3"><p className="font-semibold">{item.staffName}</p><p className="text-xs text-muted-foreground">{item.staffId}</p></td><td>{item.recipientEmail}</td><td><StatusBadge status={item.status} /></td><td>{item.sentAt ? new Date(item.sentAt).toLocaleString('en-GB') : '—'}</td><td>{item.attempts || 1}</td><td className="max-w-xs text-xs text-red-600">{item.errorMessage || '—'}</td></tr>)}</tbody></table>{!logs.length && <EmptyHint>No payslip emails have been queued for this payroll.</EmptyHint>}</div></Card>;
}

function ChecklistItem({ label, checked, automatic }) { return <div className={`flex items-start gap-3 rounded-xl border p-3 ${checked ? 'border-emerald-500/25 bg-emerald-500/[.05]' : 'border-red-500/25 bg-red-500/[.04]'}`}>{checked ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}<div><p className="text-sm font-semibold">{label}</p>{automatic && <p className="text-[10px] uppercase tracking-wide text-muted-foreground">System verified</p>}</div></div>; }
function ManualCheck({ label, checked, onChange }) { return <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? 'border-emerald-500/25 bg-emerald-500/[.05]' : 'border-border hover:bg-muted/40'}`}><input type="checkbox" className="sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />{checked ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}<div><p className="text-sm font-semibold">{label}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Finance confirmation required</p></div></label>; }
function SummaryMetric({ label, value, icon: Icon, tone }) { const styles = tone === 'green' ? 'bg-emerald-500/10 text-emerald-600' : tone === 'amber' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'; return <div className="rounded-xl border border-border p-4"><span className={`inline-flex rounded-lg p-2 ${styles}`}><Icon className="h-4 w-4" /></span><p className="mt-3 text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>; }
function StatusPill({ label, tone }) { return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${tone === 'red' ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>{label}</span>; }
function Banner({ tone, children }) { return <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${tone === 'green' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-red-500/30 bg-red-500/10 text-red-700'}`}>{children}</div>; }
function Info({ label, value, tone }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 font-bold ${tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : ''}`}>{value}</p></div>; }
function statusLabel(status) { return ({ approved: 'Approved', generated: 'Generated', partially_sent: 'Partially Sent', sent: 'Sent' })[status] || status; }
function deliverySummary(logs) { return { total: logs.length, sent: logs.filter((item) => ['Sent', 'Delivered'].includes(item.status)).length, failed: logs.filter((item) => item.status === 'Failed').length, pending: logs.filter((item) => ['Pending', 'Sending', 'Retried'].includes(item.status)).length, bounced: logs.filter((item) => item.status === 'Bounced').length }; }
