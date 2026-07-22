import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileClock, FileLock2, FileText, History, Maximize2, Minus, Plus, Scan } from 'lucide-react';
import { getBatchPayslipsZip, getPayrollBatches, getStaffPayslipPdf } from '@/api/portalClient';
import { EmptyHint, PageHeader, PrimaryButton, SecondaryButton, StatusBadge } from '@/components/payroll/PageElements';
import ResponsiveSheet from '@/components/ui/responsive-sheet';
import { toast } from '@/components/ui/use-toast';

const Card = ({ children, className = '' }) => <section className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</section>;
const inputClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25';

export default function PayslipPreviewPage() {
  const [searchParams] = useSearchParams();
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [staffIndex, setStaffIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [passwordRule, setPasswordRule] = useState('none');
  const [customPassword, setCustomPassword] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [previewMode, setPreviewMode] = useState('page-width');
  const [zoom, setZoom] = useState(100);
  const [fullScreenOpen, setFullScreenOpen] = useState(false);

  useEffect(() => {
    getPayrollBatches().then((rows) => {
      const ready = rows.filter((batch) => ['approved', 'generated', 'partially_sent', 'sent'].includes(batch.status));
      setBatches(ready);
      const requested = searchParams.get('batch');
      setSelectedId(ready.some((item) => item.id === requested) ? requested : ready[0]?.id || '');
    }).catch((err) => setError(err.message));
  }, [searchParams]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const batch = batches.find((item) => item.id === selectedId);
  const entries = batch?.entries || [];
  const safeIndex = Math.min(staffIndex, Math.max(0, entries.length - 1));
  const selectedEntry = entries[safeIndex];
  const correctionEvents = useMemo(() => (batch?.approvalHistory || []).filter((event) => ['rejected', 'request_correction', 'corrected'].includes(String(event.action).toLowerCase())), [batch]);
  const options = { passwordRule, customPassword };
  const validatePassword = () => {
    if (passwordRule === 'custom' && customPassword.trim().length < 6) { toast.warning('Custom PDF passwords must contain at least 6 characters.', { title: 'Password is too short' }); return false; }
    return true;
  };
  const replacePreview = (url = '') => {
    if (!url) setFullScreenOpen(false);
    setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return url; });
  };
  const preview = async (entry = selectedEntry) => {
    if (!entry || !batch || !validatePassword()) return;
    setBusyKey(`preview-${entry.staffRecordId}`);
    try {
      const { blob } = await getStaffPayslipPdf(batch.id, entry.staffRecordId, options);
      replacePreview(URL.createObjectURL(blob));
      setBatches((current) => current.map((item) => item.id === batch.id && item.status === 'approved' ? { ...item, status: 'generated' } : item));
      setError('');
    } catch (err) { setError(err.message); }
    finally { setBusyKey(''); }
  };
  const moveStaff = async (direction) => {
    const next = Math.max(0, Math.min(entries.length - 1, safeIndex + direction));
    if (next === safeIndex) return;
    setStaffIndex(next); replacePreview('');
    await preview(entries[next]);
  };
  const download = async () => {
    if (!selectedEntry || !batch || !validatePassword()) return;
    setBusyKey(`download-${selectedEntry.staffRecordId}`);
    try {
      saveBlob(await getStaffPayslipPdf(batch.id, selectedEntry.staffRecordId, options, true));
      toast.success(`${selectedEntry.fullName}'s confidential PDF is downloading.`, { title: 'Payslip ready' });
      setError('');
    } catch (err) { toast.error(err.message, { title: 'PDF download failed' }); }
    finally { setBusyKey(''); }
  };
  const generateAll = async () => {
    if (!batch || !validatePassword()) return;
    setBusyKey('all');
    try {
      saveBlob(await getBatchPayslipsZip(batch.id, options));
      setBatches((current) => current.map((item) => item.id === batch.id && item.status === 'approved' ? { ...item, status: 'generated' } : item));
      toast.success(`${entries.length} payslips were generated and packaged into a secure ZIP file.`, { title: 'All payslips generated' });
      setError('');
    } catch (err) { toast.error(err.message, { title: 'Generate all failed' }); }
    finally { setBusyKey(''); }
  };
  const changeBatch = (id) => { replacePreview(''); setSelectedId(id); setStaffIndex(0); setError(''); };
  const selectStaff = (index) => { replacePreview(''); setStaffIndex(Number(index)); };
  const previewFragment = previewMode === 'zoom' ? `zoom=${zoom}` : previewMode === 'page-fit' ? 'view=Fit' : 'view=FitH';

  return <div className="space-y-6">
    <PageHeader title="Payslip PDF Preview" description="Review each approved payslip at a readable size before downloading or generating the full batch." />
    {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-5 xl:grid-cols-[1.2fr,.8fr]"><Card><label htmlFor="payslip-preview-batch" className="text-xs font-bold uppercase text-muted-foreground">Approved payroll batch</label><select id="payslip-preview-batch" className={`${inputClass} mt-2`} value={selectedId} onChange={(event) => changeBatch(event.target.value)}><option value="">Select an approved payroll</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.name} · Version {item.version || 1} · {statusLabel(item.status)}</option>)}</select>{batch && <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-primary/[.04] p-4 sm:grid-cols-4"><Info label="Period" value={batch.period} /><Info label="Version" value={`v${batch.version || 1}`} /><Info label="Approved by" value={batch.approvedBy || 'System policy'} /><div><p className="text-xs text-muted-foreground">Approval status</p><div className="mt-1"><StatusBadge status={batch.approvedAt || batch.approvedBy ? 'Approved' : statusLabel(batch.status)} /></div></div></div>}</Card><Card><div className="flex items-center gap-2"><FileLock2 className="h-5 w-5 text-primary" /><h2 className="font-heading text-lg font-bold">PDF protection</h2></div><label htmlFor="payslip-password-rule" className="sr-only">PDF password rule</label><select id="payslip-password-rule" className={`${inputClass} mt-4`} value={passwordRule} onChange={(event) => { setPasswordRule(event.target.value); replacePreview(''); }}><option value="none">No password</option><option value="staff_id">Staff ID</option><option value="phone">Phone number</option><option value="custom">Custom password</option></select>{passwordRule === 'custom' && <input aria-label="Custom PDF password" className={`${inputClass} mt-3`} type="password" value={customPassword} onChange={(event) => { setCustomPassword(event.target.value); replacePreview(''); }} placeholder="At least 6 characters" />}<p className="mt-3 text-xs leading-5 text-muted-foreground">Protection is applied separately to every individual PDF and every PDF inside the generated ZIP.</p></Card></div>
    {batch && <Card className="p-4"><div className="grid gap-3 lg:grid-cols-[auto,minmax(220px,1fr),auto]"><div className="grid grid-cols-2 gap-2"><SecondaryButton disabled={!entries.length || safeIndex === 0 || Boolean(busyKey)} onClick={() => moveStaff(-1)}><ChevronLeft className="h-4 w-4" /> Previous Staff</SecondaryButton><SecondaryButton disabled={!entries.length || safeIndex >= entries.length - 1 || Boolean(busyKey)} onClick={() => moveStaff(1)}>Next Staff <ChevronRight className="h-4 w-4" /></SecondaryButton></div><select aria-label="Selected staff payslip" className={inputClass} value={safeIndex} onChange={(event) => selectStaff(event.target.value)}>{entries.map((entry, index) => <option key={entry.staffRecordId} value={index}>{index + 1}. {entry.fullName} · {entry.staffId}</option>)}</select><p className="self-center text-center text-xs font-semibold text-muted-foreground lg:text-right">Staff {entries.length ? safeIndex + 1 : 0} of {entries.length}</p></div></Card>}
    {selectedEntry && <div className="grid gap-3 md:grid-cols-3"><ActionCard icon={Eye} title="Preview" note="Open the selected staff payslip in the secure viewer."><SecondaryButton className="w-full" disabled={Boolean(busyKey)} onClick={() => preview()}><Eye className="h-4 w-4" />{busyKey.startsWith('preview-') ? 'Loading Preview…' : 'Preview Selected'}</SecondaryButton></ActionCard><ActionCard icon={Download} title="Download" note="Download only this staff member's PDF."><SecondaryButton className="w-full" disabled={Boolean(busyKey)} onClick={download}><Download className="h-4 w-4" />{busyKey.startsWith('download-') ? 'Preparing…' : 'Download Selected'}</SecondaryButton></ActionCard><ActionCard icon={Archive} title="Generate All" note="Generate every staff PDF and download one ZIP."><PrimaryButton className="w-full" disabled={Boolean(busyKey)} onClick={generateAll}><Archive className="h-4 w-4" />{busyKey === 'all' ? 'Generating All…' : 'Generate All Payslips'}</PrimaryButton></ActionCard></div>}
    {previewUrl && <Card className="p-3"><div className="grid grid-cols-2 gap-2 min-[390px]:grid-cols-3 sm:flex sm:flex-wrap" role="toolbar" aria-label="Payslip preview controls"><button type="button" onClick={() => setPreviewMode('page-width')} aria-pressed={previewMode === 'page-width'} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold ${previewMode === 'page-width' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}><Scan className="h-4 w-4" /> Page width</button><button type="button" onClick={() => setPreviewMode('page-fit')} aria-pressed={previewMode === 'page-fit'} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold ${previewMode === 'page-fit' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}><FileText className="h-4 w-4" /> Fit page</button><div className="col-span-2 flex min-h-11 items-center justify-between rounded-lg border border-border min-[390px]:col-span-1"><button type="button" aria-label="Zoom out" onClick={() => { setPreviewMode('zoom'); setZoom((value) => Math.max(50, value - 10)); }} className="min-h-11 min-w-11"><Minus className="mx-auto h-4 w-4" /></button><span className="text-xs font-bold">{zoom}%</span><button type="button" aria-label="Zoom in" onClick={() => { setPreviewMode('zoom'); setZoom((value) => Math.min(200, value + 10)); }} className="min-h-11 min-w-11"><Plus className="mx-auto h-4 w-4" /></button></div><button type="button" onClick={() => setFullScreenOpen(true)} className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/[.06] px-3 text-xs font-semibold text-primary transition hover:bg-primary/10 min-[390px]:col-span-3 sm:col-span-1"><Maximize2 className="h-4 w-4" /> Full-screen Preview</button></div></Card>}
    <Card className="overflow-hidden p-0"><div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><FileText className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><h2 className="truncate font-heading text-lg font-bold">{selectedEntry ? `${selectedEntry.fullName} — Payslip` : 'Payslip viewer'}</h2><p className="truncate text-xs text-muted-foreground">{selectedEntry ? `${selectedEntry.staffId} · ${selectedEntry.department} · ${selectedEntry.branch}` : 'Select an approved payroll batch.'}</p></div></div><div className="flex items-center gap-2">{batch && <StatusBadge status={`Version ${batch.version || 1}`} />}</div></div><div className="overflow-hidden bg-muted/30 p-2 sm:p-4">{previewUrl ? <div className="mx-auto w-full max-w-[900px] overflow-hidden rounded-lg border border-border bg-white shadow-inner"><iframe key={previewFragment} title={`Payslip preview for ${selectedEntry?.fullName || 'staff'}`} src={`${previewUrl}#${previewFragment}&toolbar=1&navpanes=0`} className="h-[58dvh] min-h-[380px] w-full border-0 sm:h-[72vh] sm:min-h-[620px]" /></div> : <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center sm:min-h-[420px]"><Eye className="h-10 w-10 text-primary/50" /><h3 className="mt-4 font-heading text-lg font-bold">Preview at readable width</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">Choose a staff member and select Preview. The PDF will fit inside this viewer without making the page scroll sideways.</p></div>}</div></Card>
    <ResponsiveSheet open={fullScreenOpen && Boolean(previewUrl)} onOpenChange={setFullScreenOpen} title={selectedEntry ? `${selectedEntry.fullName} — Payslip` : 'Payslip preview'} description={selectedEntry ? `${selectedEntry.staffId} · Version ${batch?.version || 1} · Confidential staff document` : 'Confidential staff document'} className="sm:max-h-[94dvh] sm:w-[min(72rem,calc(100vw-2rem))]"><div className="space-y-3"><div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="toolbar" aria-label="Full-screen payslip controls"><ViewerModeButton active={previewMode === 'page-width'} onClick={() => setPreviewMode('page-width')} icon={Scan}>Page width</ViewerModeButton><ViewerModeButton active={previewMode === 'page-fit'} onClick={() => setPreviewMode('page-fit')} icon={FileText}>Fit page</ViewerModeButton><div className="col-span-2 flex min-h-11 items-center justify-between rounded-lg border border-border bg-background sm:w-40"><button type="button" aria-label="Zoom out" onClick={() => { setPreviewMode('zoom'); setZoom((value) => Math.max(50, value - 10)); }} className="min-h-11 min-w-11 rounded-l-lg hover:bg-muted"><Minus className="mx-auto h-4 w-4" /></button><span className="text-xs font-bold">{zoom}%</span><button type="button" aria-label="Zoom in" onClick={() => { setPreviewMode('zoom'); setZoom((value) => Math.min(200, value + 10)); }} className="min-h-11 min-w-11 rounded-r-lg hover:bg-muted"><Plus className="mx-auto h-4 w-4" /></button></div><SecondaryButton className="col-span-2 sm:ml-auto" disabled={Boolean(busyKey)} onClick={download}><Download className="h-4 w-4" /> Download PDF</SecondaryButton></div><div className="overflow-hidden rounded-xl border border-border bg-slate-200 p-1 shadow-inner dark:bg-slate-950 sm:p-2"><iframe key={`fullscreen-${previewFragment}`} title={`Full-screen payslip preview for ${selectedEntry?.fullName || 'staff'}`} src={`${previewUrl}#${previewFragment}&toolbar=1&navpanes=0`} className="h-[calc(100dvh-15.5rem)] min-h-[320px] max-h-[72dvh] w-full rounded-lg border-0 bg-white" /></div></div></ResponsiveSheet>
    {batch && <CorrectionHistory batch={batch} events={correctionEvents} />}
    {!batch && <EmptyHint>No approved payroll is available for PDF preview.</EmptyHint>}
    <p className="text-center text-xs text-muted-foreground">Every PDF is confidential and generated from the permanent payroll record. Original and revised versions remain separate for audit purposes.</p>
  </div>;
}

function CorrectionHistory({ batch, events }) {
  const hasRevision = Number(batch.version || 1) > 1 || batch.revisionOf || batch.revisionReason;
  return <Card><div className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /><div><h2 className="font-heading text-lg font-bold">Correction and approval history</h2><p className="text-xs text-muted-foreground">Version {batch.version || 1} · {batch.approvedBy ? `Approved by ${batch.approvedBy}` : 'Approval recorded by system policy'}</p></div></div>{hasRevision && <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[.06] p-4"><p className="text-sm font-bold text-amber-800 dark:text-amber-400">Revised payslip version</p><p className="mt-1 text-sm">{batch.revisionReason || 'This version corrects an earlier sent payslip.'}</p>{batch.revisesBatchId && <p className="mt-1 text-xs text-muted-foreground">Previous batch reference: {batch.revisesBatchId}</p>}</div>}<div className="mt-4 divide-y divide-border">{events.slice().reverse().map((event) => <div key={event.id} className="flex gap-3 py-3"><FileClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div><p className="text-sm font-semibold capitalize">{String(event.action).replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{event.actorName} · {new Date(event.timestamp).toLocaleString('en-GB')}</p>{event.comments && <p className="mt-1 text-sm">{event.comments}</p>}</div></div>)}{!events.length && !hasRevision && <div className="flex items-center gap-2 py-3 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />Original approved version — no corrections recorded.</div>}</div></Card>;
}

function ActionCard({ icon: Icon, title, note, children }) { return <Card className="flex h-full flex-col p-4"><div className="flex items-center gap-2"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span><h2 className="font-heading font-bold">{title}</h2></div><p className="mb-4 mt-2 flex-1 text-xs text-muted-foreground">{note}</p>{children}</Card>; }
function ViewerModeButton({ active, onClick, icon: Icon, children }) { return <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted'}`}><Icon className="h-4 w-4" />{children}</button>; }
function saveBlob({ blob, filename }) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function statusLabel(status) { return ({ approved: 'Approved', generated: 'Generated', partially_sent: 'Partially Sent', sent: 'Sent' })[status] || status; }
function Info({ label, value }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-bold" title={String(value)}>{value}</p></div>; }
