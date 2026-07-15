import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Mail, RefreshCcw, Save, Send, Server, ShieldCheck } from 'lucide-react';
import { getPayrollBatches, getPayslipEmailDelivery, resendFailedPayslipEmails, savePayslipEmailTemplate, sendAllPayslipEmails, sendPayslipTestEmail } from '@/api/portalClient';
import { EmptyHint, PageHeader, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/payroll/PageElements';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';
import ConfirmActionDialog from '@/components/ui/confirm-action-dialog';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</section>;
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';
const deliverableStatuses = ['approved', 'generated', 'partially_sent', 'sent'];

function useDeliveryWorkspace() {
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [delivery, setDelivery] = useState({ deliveries: [], template: { subject: '', body: '' }, recipientIssues: [], mailConfigured: false, provider: '' });
  const [error, setError] = useState('');
  const loadBatches = useCallback(async () => {
    const rows = (await getPayrollBatches()).filter((batch) => deliverableStatuses.includes(batch.status));
    setBatches(rows);
    setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id || '');
  }, []);
  const refresh = useCallback(async () => {
    if (!selectedId) return;
    try { setDelivery(await getPayslipEmailDelivery(selectedId)); setError(''); } catch (err) { setError(err.message); }
  }, [selectedId]);
  useEffect(() => { loadBatches().catch((err) => setError(err.message)); }, [loadBatches]);
  useEffect(() => { refresh(); }, [refresh]);
  const active = delivery.deliveries.some((item) => ['Pending', 'Sending', 'Retried'].includes(item.status));
  useEffect(() => { if (!active) return undefined; const timer = window.setInterval(refresh, 1500); return () => window.clearInterval(timer); }, [active, refresh]);
  return { batches, selectedId, setSelectedId, batch: batches.find((item) => item.id === selectedId), delivery, setDelivery, error, setError, refresh, loadBatches };
}

export function SendPayslips() {
  const { user } = useAuth();
  const workspace = useDeliveryWorkspace();
  const { batches, selectedId, setSelectedId, batch, delivery, setDelivery, error, setError, refresh, loadBatches } = workspace;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testEmail, setTestEmail] = useState(user?.email || '');
  const [busy, setBusy] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  useEffect(() => { setSubject(delivery.template?.subject || ''); setBody(delivery.template?.body || ''); }, [delivery.template]);
  const logs = delivery.deliveries.filter((item) => !item.isTest);
  const failed = logs.filter((item) => ['Failed', 'Bounced'].includes(item.status)).length;
  const saveTemplate = async (quiet = false) => { setBusy('save'); try { const template = await savePayslipEmailTemplate(selectedId, subject, body); setDelivery((current) => ({ ...current, template })); setError(''); if (!quiet) toast.success('The subject and message body are ready for this payroll.', { title: 'Email template saved' }); return true; } catch (err) { toast.error(err.message, { title: 'Template was not saved' }); return false; } finally { setBusy(''); } };
  const test = async () => { setBusy('test'); try { await savePayslipEmailTemplate(selectedId, subject, body); const result = await sendPayslipTestEmail(selectedId, { email: testEmail, subject, body }); setError(''); toast.success(result.message, { title: 'Test email sent' }); await refresh(); } catch (err) { toast.error(err.message, { title: 'Test email failed' }); } finally { setBusy(''); } };
  const sendAll = async () => { setBusy('send'); try { if (!await saveTemplate(true)) return; const result = await sendAllPayslipEmails(selectedId); setConfirmSend(false); toast.success(`${result.queued} payslips were added to the secure background queue.`, { title: 'Delivery started' }); await refresh(); } catch (err) { toast.error(err.message, { title: 'Payslips were not queued' }); } finally { setBusy(''); } };
  const retry = async () => { setBusy('retry'); try { const result = await resendFailedPayslipEmails(selectedId); toast.warning(`${result.queued} failed emails were queued for another attempt.`, { title: 'Retry started' }); await refresh(); } catch (err) { toast.error(err.message, { title: 'Retry failed' }); } finally { setBusy(''); } };
  const testSatisfied = !delivery.requireTestEmail || Boolean(delivery.testEmailSentAt);
  const canSend = batch && ['approved', 'generated'].includes(batch.status) && delivery.mailConfigured && !delivery.recipientIssues.length && !logs.length && testSatisfied;
  return <div className="space-y-6"><PageHeader title="Send Payslips" description="Send one confidential PDF to each staff member through the secure background email queue." actions={failed ? <SecondaryButton disabled={Boolean(busy)} onClick={retry}><RefreshCcw className="h-4 w-4" /> Resend Failed Emails ({failed})</SecondaryButton> : null} />
    {error && <Banner tone="red">{error}</Banner>}
    <div className="grid gap-5 lg:grid-cols-[1.2fr,.8fr]"><Card><label className="text-xs font-bold uppercase text-muted-foreground">Approved payroll batch</label><select className={`${inputClass} mt-2`} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Select payroll</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.name} · Version {item.version || 1} · {statusLabel(item.status)}</option>)}</select>{batch && <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-primary/[.04] p-4"><Info label="Recipients" value={batch.entries?.length || 0} /><Info label="Period" value={batch.period} /><div><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><StatusBadge status={statusLabel(batch.status)} /></div></div></div>}</Card><Card><div className="flex items-center gap-2"><Server className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">Email provider</h2></div><p className="mt-3 text-sm font-semibold">{delivery.provider || 'Select a payroll to check SMTP'}</p><p className="mt-2 text-xs text-muted-foreground">Credentials are stored only on the server and are never returned to this page.</p><div className="mt-3"><StatusBadge status={delivery.mailConfigured ? 'Ready' : 'Not Configured'} /></div></Card></div>
    {delivery.recipientIssues.length > 0 && <Card className="border-red-500/30 bg-red-500/[.03]"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" /><div><h2 className="font-bold text-red-700">Sending blocked: {delivery.recipientIssues.length} recipient issues</h2><div className="mt-2 space-y-1 text-sm">{delivery.recipientIssues.map((item) => <p key={item.staffRecordId}><b>{item.fullName}</b> ({item.staffId}): {item.issue}</p>)}</div></div></div></Card>}
    {batch && !testSatisfied && <Banner tone="red"><AlertTriangle className="h-4 w-4" />A successful test email is required before bulk sending.</Banner>}
    <div className="grid gap-5 xl:grid-cols-[1fr,.72fr]"><Card><div className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">Email template</h2></div><p className="mt-1 text-xs text-muted-foreground">Available fields: {'{staff_name}'}, {'{month}'}, {'{year}'}</p><label className="mt-4 block text-sm font-semibold">Subject<input className={`${inputClass} mt-1.5`} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label className="mt-4 block text-sm font-semibold">Message body<textarea className="mt-1.5 min-h-52 w-full rounded-lg border border-border bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-primary/25" value={body} onChange={(event) => setBody(event.target.value)} /></label><SecondaryButton className="mt-4" disabled={!batch || busy === 'save'} onClick={saveTemplate}><Save className="h-4 w-4" /> Save Template</SecondaryButton></Card><Card><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">Private delivery</h2></div><p className="mt-2 text-sm text-muted-foreground">Each message has exactly one recipient and one password-protected PDF. No staff addresses are placed in CC or BCC.</p><label className="mt-5 block text-sm font-semibold">Test recipient<input className={`${inputClass} mt-1.5`} type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="finance@bawjiasecommunitybank.com" /></label><SecondaryButton className="mt-3 w-full" disabled={!batch || !delivery.mailConfigured || !testEmail || Boolean(busy)} onClick={test}><Mail className="h-4 w-4" /> {busy === 'test' ? 'Sending Test…' : 'Send Test Email'}</SecondaryButton><div className="my-5 border-t border-border" /><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Payslips</span><b>{batch?.entries?.length || 0}</b></div><div className="flex justify-between"><span className="text-muted-foreground">Recipient problems</span><b className={delivery.recipientIssues.length ? 'text-red-600' : 'text-emerald-600'}>{delivery.recipientIssues.length}</b></div><div className="flex justify-between"><span className="text-muted-foreground">Failed / bounced</span><b>{failed}</b></div></div><PrimaryButton className="mt-5 w-full" disabled={!canSend || Boolean(busy)} onClick={() => setConfirmSend(true)}><Send className="h-4 w-4" /> {busy === 'send' ? 'Adding to Queue…' : 'Send All Payslips'}</PrimaryButton>{logs.length > 0 && <p className="mt-3 text-center text-xs text-muted-foreground">A delivery run already exists for this payroll. Failed messages can be retried without resending successful ones.</p>}</Card></div>
    <DeliveryLogTable logs={logs} />
    <ConfirmActionDialog open={confirmSend} title="Send all approved payslips?" description={`This will queue ${batch?.entries?.length || 0} private emails. Each staff member will receive only their own password-protected payslip.`} confirmLabel="Send all payslips" busy={busy === 'send'} onClose={() => setConfirmSend(false)} onConfirm={sendAll} />
  </div>;
}

function DeliveryLogTable({ logs }) {
  return <Card><h2 className="font-heading text-lg font-bold">Email logs</h2><div className="mt-4 grid gap-3 md:hidden">{logs.map((item) => <article key={item.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.staffName}</p><p className="truncate text-xs text-muted-foreground">{item.recipientEmail}</p></div><StatusBadge status={item.status} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><p><span className="text-muted-foreground">Attempts</span><br /><b>{item.attempts || 1}</b></p><p><span className="text-muted-foreground">Sent</span><br /><b>{item.sentAt ? new Date(item.sentAt).toLocaleString() : '?'}</b></p></div>{item.errorMessage && <p className="mt-3 text-xs text-red-600">{item.errorMessage}</p>}</article>)}{!logs.length && <EmptyHint>No payslip emails have been queued for this payroll.</EmptyHint>}</div><div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted-foreground"><tr><th className="pb-3">Staff member</th><th className="pb-3">Recipient</th><th className="pb-3">Status</th><th className="pb-3">Sent time</th><th className="pb-3">Attempts</th><th className="pb-3">Sent by</th><th className="pb-3">Error</th></tr></thead><tbody>{logs.map((item) => <tr key={item.id} className="border-b border-border/60 last:border-0"><td className="py-3"><p className="font-semibold">{item.staffName}</p><p className="text-xs text-muted-foreground">{item.staffId}</p></td><td>{item.recipientEmail}</td><td><StatusBadge status={item.status} /></td><td>{item.sentAt ? new Date(item.sentAt).toLocaleString() : '—'}</td><td>{item.attempts || 1}</td><td>{item.sentBy}</td><td className="max-w-xs text-xs text-red-600">{item.errorMessage || '—'}</td></tr>)}</tbody></table>{!logs.length && <EmptyHint>No payslip emails have been queued for this payroll.</EmptyHint>}</div></Card>;
}

function Banner({ tone, children }) { return <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${tone === 'green' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-red-500/30 bg-red-500/10 text-red-700'}`}>{children}</div>; }
function Info({ label, value }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }
function statusLabel(status) { return ({ approved: 'Approved', generated: 'Generated', partially_sent: 'Partially Sent', sent: 'Sent' })[status] || status; }
