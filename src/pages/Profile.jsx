import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ControlledSelect from "@/components/ui/controlled-select";
import ConfirmActionDialog from "@/components/ui/confirm-action-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/lib/ThemeContext";
import {
  getPortalSettings,
  getMfaStatus,
  startMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  getUserProfile,
  resolveAssetUrl,
  updateUserProfile,
  uploadProfilePhoto,
} from "@/api/portalClient";
import {
  Building2,
  Calendar,
  Camera,
  Check,
  ImageOff,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Pencil,
  Phone,
  Save,
  Shield,
  Sun,
  UserCircle,
  X,
} from "lucide-react";

function initials(name) {
  return String(name || "User")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function roleLabel(role) {
  if (role === "SuperAdmin") return "Super Admin";
  if (role === "Admin") return "Admin";
  if (role === "FinanceOfficer") return "Finance Officer";
  if (role === "FinanceApprover") return "Finance Approver";
  if (role === "Auditor") return "Auditor";
  return "Management";
}

function formatDate(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "Unknown";
  return new Date(timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 py-3 last:border-b-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value || "-"}</p>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [mfa, setMfa] = useState({ enabled: false, encryptionConfigured: false });
  const [mfaEnrollment, setMfaEnrollment] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [disableMfaForm, setDisableMfaForm] = useState(null);
  const [form, setForm] = useState({
    fullname: "",
    phone: "",
    branch: "",
    department: "",
    position: "",
  });

  const canEditOrg = user?.role === "SuperAdmin" || user?.role === "Admin";
  const currentPhoto = removePhoto ? "" : preview || resolveAssetUrl(user?.imageFile);

  useEffect(() => {
    if (!user) return;
    setForm({
      fullname: user.fullname || user.full_name || "",
      phone: user.phone || "",
      branch: user.branch || user.branch_name || "",
      department: user.department || "",
      position: user.position || "",
    });
  }, [user]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [settings, profile] = await Promise.all([
          getPortalSettings(),
          user?.id ? getUserProfile(user.id) : Promise.resolve(null),
        ]);
        if (!mounted) return;
        setBranches(settings.branches || []);
        setDepartments(settings.departments || []);
        if (profile) updateUser(profile);
      } catch {
        // Keep local session profile if refresh fails.
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => { if (user?.id) getMfaStatus().then(setMfa).catch(() => {}); }, [user?.id]);

  async function beginMfa() {
    setError("");
    try { setMfaEnrollment(await startMfaEnrollment()); setMfaCode(""); }
    catch (err) { setError(err.message); }
  }

  async function confirmMfa() {
    try { const result = await confirmMfaEnrollment(mfaCode); setMfa({ ...mfa, enabled: true }); setMfaEnrollment(null); setRecoveryCodes(result.recoveryCodes || []); updateUser({ ...user, mfaEnabled: true }); setMessage("Authenticator protection enabled."); }
    catch (err) { setError(err.message); }
  }

  async function turnOffMfa() {
    setDisableMfaForm({ password: '', code: '' });
  }

  async function confirmTurnOffMfa() {
    if (!disableMfaForm?.password || !/^\d{6}$/.test(disableMfaForm.code)) return;
    setSaving(true);
    try { await disableMfa(disableMfaForm.password, disableMfaForm.code); setDisableMfaForm(null); window.sessionStorage.setItem('bcb_session_message', 'Authenticator protection was disabled. Sign in again.'); await logout(); navigate('/login', { replace: true }); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    return () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function cancelEdit() {
    if (!user) return;
    setEditing(false);
    setError("");
    setPhotoFile(null);
    setRemovePhoto(false);
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview("");
    setForm({
      fullname: user.fullname || "",
      phone: user.phone || "",
      branch: user.branch || "",
      department: user.department || "",
      position: user.position || "",
    });
  }

  function handlePhotoSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Please keep profile photos under 10 MB.");
      return;
    }
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPhotoFile(file);
    setPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
  }

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        fullname: form.fullname,
        phone: form.phone,
        position: form.position,
      };
      if (canEditOrg) {
        payload.branch = form.branch;
        payload.department = form.department;
      }
      if (photoFile) {
        const uploaded = await uploadProfilePhoto(photoFile);
        payload.imageFile = `LOCAL:${uploaded.filename}`;
      } else if (removePhoto) {
        payload.imageFile = null;
      }
      const updated = await updateUserProfile(user.id, payload);
      updateUser(updated);
      setEditing(false);
      setPhotoFile(null);
      setRemovePhoto(false);
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPreview("");
      setMessage("Profile updated successfully.");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Profile could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 lg:pb-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-500">
            Personal workspace
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-heading text-2xl font-bold text-foreground lg:text-3xl">
            <UserCircle className="h-7 w-7 text-blue-500" />
            My Profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep your contact information, branch, and profile image current.
          </p>
        </div>
        <Button variant="outline" onClick={toggleTheme} className="gap-2">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          Toggle Theme
        </Button>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-600">
          <Check className="h-4 w-4" />
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
          <div className="relative">
            <button
              type="button"
              onClick={() => editing && fileInputRef.current?.click()}
              className={`relative h-24 w-24 overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg ${
                editing ? "ring-4 ring-blue-500/20" : ""
              }`}
            >
              {currentPhoto ? (
                <img src={currentPhoto} alt={user.fullname} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-bold">
                  {initials(user.fullname)}
                </span>
              )}
              {editing && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                  <Camera className="h-6 w-6" />
                </span>
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-xl font-bold text-foreground">{user.fullname}</h2>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {user.position || "Staff"} - {user.department}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge>{roleLabel(user.role)}</Badge>
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {user.branch}
              </Badge>
              <Badge variant={user.accountStatus === "active" ? "secondary" : "destructive"}>
                {(user.accountStatus || "active").replace(/^./, (letter) => letter.toUpperCase())}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Last seen: {formatDate(user.lastSeen)}
            </p>
          </div>

          <div className="flex w-full justify-center gap-2 sm:w-auto sm:justify-start">
            {editing ? (
              <Button variant="outline" onClick={cancelEdit} className="gap-2">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)} className="gap-2">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr,0.9fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 font-heading text-lg font-bold text-foreground">
            {editing ? "Edit Profile" : "Profile Details"}
          </h3>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Full Name
                </label>
                <Input value={form.fullname} onChange={(event) => updateField("fullname", event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Phone
                </label>
                <Input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Position
                </label>
                <Input value={form.position} onChange={(event) => updateField("position", event.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Branch
                  </label>
                  <ControlledSelect
                    value={form.branch}
                    disabled={!canEditOrg}
                    onChange={(value) => updateField("branch", value)}
                    options={branches}
                    className="rounded-lg border-border bg-background py-2.5 text-sm disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Department
                  </label>
                  <ControlledSelect
                    value={form.department}
                    disabled={!canEditOrg}
                    onChange={(value) => updateField("department", value)}
                    options={departments}
                    className="rounded-lg border-border bg-background py-2.5 text-sm disabled:opacity-60"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {currentPhoto && !removePhoto && (
                  <Button type="button" variant="outline" onClick={() => { setRemovePhoto(true); setPhotoFile(null); setPreview(""); }} className="gap-2">
                    <ImageOff className="h-4 w-4" />
                    Remove Photo
                  </Button>
                )}
                <Button type="button" onClick={saveProfile} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={user.email} />
              <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={user.phone} />
              <InfoRow icon={<Building2 className="h-4 w-4" />} label="Department" value={user.department} />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label="Branch" value={user.branch} />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-heading text-lg font-bold text-foreground">Authenticator security</h3><p className="text-sm text-muted-foreground">Use a time-based 6-digit code in addition to your password.</p></div>{mfa.enabled ? <Button variant="outline" onClick={turnOffMfa}>Disable MFA</Button> : <Button onClick={beginMfa} disabled={!mfa.encryptionConfigured}>Enable MFA</Button>}</div>
            {!mfa.encryptionConfigured && <p className="mt-3 text-xs text-amber-700">An administrator must configure the MFA encryption key first.</p>}
            {mfaEnrollment && <div className="mt-4 rounded-xl bg-muted/50 p-4"><p className="text-sm font-semibold">Add this setup key to Microsoft Authenticator, Google Authenticator, or another TOTP app:</p><code className="mt-2 block break-all rounded bg-background p-3 text-sm">{mfaEnrollment.secret}</code><p className="mt-3 text-xs text-muted-foreground">Then enter the current code to confirm setup.</p><div className="mt-2 flex gap-2"><Input inputMode="numeric" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" /><Button disabled={mfaCode.length !== 6} onClick={confirmMfa}>Confirm</Button></div></div>}
            {recoveryCodes.length > 0 && <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="font-semibold text-amber-900">Save these one-time recovery codes now</p><p className="mt-1 text-xs text-amber-800">They will not be shown again. Store them in the bank-approved password manager.</p><div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">{recoveryCodes.map((code) => <code key={code} className="rounded bg-background p-2 text-center">{code}</code>)}</div><Button className="mt-3" variant="outline" onClick={() => { navigator.clipboard?.writeText(recoveryCodes.join('\n')); }}>Copy codes</Button></div>}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-heading text-lg font-bold text-foreground">Account Information</h3>
            <div className="space-y-1">
              <InfoRow icon={<Shield className="h-4 w-4" />} label="Role" value={roleLabel(user.role)} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label="Registered" value={formatDate(user.registrationTime)} />
              <InfoRow icon={<UserCircle className="h-4 w-4" />} label="Status" value={user.isVerified ? "Verified" : "Unverified"} />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-heading text-lg font-bold text-foreground">Sign out</h3>
                <p className="text-sm text-muted-foreground">End your current session on this device.</p>
              </div>
              <Button variant="outline" onClick={handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>
      <ConfirmActionDialog open={Boolean(disableMfaForm)} title="Disable authenticator protection?" description="This reduces protection for confidential payroll access. Your current password and authenticator code are required, and you will be signed out immediately." confirmLabel="Disable MFA" tone="danger" busy={saving} confirmDisabled={!disableMfaForm?.password || !/^\d{6}$/.test(disableMfaForm?.code || '')} onClose={() => setDisableMfaForm(null)} onConfirm={confirmTurnOffMfa}>
        <div className="space-y-3">
          <label className="block text-sm font-semibold">Current password<Input type="password" autoComplete="current-password" className="mt-2" value={disableMfaForm?.password || ''} onChange={(event) => setDisableMfaForm((current) => ({ ...current, password: event.target.value }))} /></label>
          <label className="block text-sm font-semibold">Authenticator code<Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="mt-2" value={disableMfaForm?.code || ''} onChange={(event) => setDisableMfaForm((current) => ({ ...current, code: event.target.value.replace(/\D/g, '').slice(0, 6) }))} /></label>
        </div>
      </ConfirmActionDialog>
    </div>
  );
}
