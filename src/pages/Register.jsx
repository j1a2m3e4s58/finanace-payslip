import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BriefcaseBusiness, Building2, CheckCircle2, CircleCheck, CircleX, Eye, EyeOff, Loader2, Lock, Mail, Phone, User } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import ControlledSelect from "@/components/ui/controlled-select";
import { registerAccount } from "@/api/authClient";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";

const initialForm = { fullname: "", phone: "", email: "", branch: "", department: "", password: "", confirmPassword: "" };
const control = "h-10 w-full rounded-lg border border-input bg-background/75 pl-10 pr-3 text-xs text-foreground [color-scheme:light] outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 dark:[color-scheme:dark]";

export default function Register() {
  const { portalSettings } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const rules = [
    ["12+ Characters", form.password.length >= 12],
    ["Uppercase (A-Z)", /[A-Z]/.test(form.password)],
    ["Small Letters (a-z)", /[a-z]/.test(form.password)],
    ["Number / Symbol", /\d/.test(form.password) && /[^A-Za-z0-9]/.test(form.password)],
  ];
  const validPassword = rules.every(([, valid]) => valid);

  if (portalSettings?.selfRegistrationEnabled === false) {
    return <AuthLayout className="flex max-w-[420px] flex-col justify-center px-6 pb-6 pt-14 text-center lg:max-w-[420px]"><h1 className="font-display text-2xl font-bold text-foreground">Registration is managed by Admin</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">For stronger payroll security, an authorized administrator must create your account from Users & Access.</p><Link to="/login" className="mt-5 font-semibold text-primary">Return to Login</Link></AuthLayout>;
  }

  const submit = async (event) => {
    event.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.warning("Enter the same password in both password fields.", { title: "Passwords do not match" });
      return;
    }
    setLoading(true);
    try {
      await registerAccount(form);
      setComplete(true);
      toast.success("Your request was sent to an administrator for approval.", { title: "Registration received" });
    } catch (err) {
      toast.error(err.message || "Registration could not be completed.", { title: "Sign up failed" });
    } finally {
      setLoading(false);
    }
  };

  if (complete) {
    return <AuthLayout className="flex max-w-[448px] flex-col justify-center px-6 pb-6 pt-14 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-7 w-7" /></div>
      <h1 className="mt-4 font-display text-2xl font-bold text-foreground">Registration Received</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Your account is pending administrator approval. You can sign in after your access role is confirmed.</p>
      <Link to="/login" className="mt-5"><Button className="glass-button h-10 w-full font-bold uppercase tracking-wider">Return to Login</Button></Link>
    </AuthLayout>;
  }

  return <AuthLayout className="px-5 pb-4 pt-[3.25rem] sm:px-6 lg:max-w-[440px]">
    <div className="mb-2.5 text-center">
      <div className="page-kicker text-center">New staff access</div>
      <h1 className="font-display text-[22px] font-bold leading-tight text-foreground">Staff Registration</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">Create your secure finance account</p>
    </div>
    <form onSubmit={submit} className="grid grid-cols-2 gap-x-2 gap-y-2">
      <Field label="Full Name" icon={User} className="col-span-2 sm:col-span-1"><input className={control} placeholder="John Mensah" value={form.fullname} onChange={(e) => update("fullname", e.target.value)} autoComplete="name" required /></Field>
      <Field label="Phone Number" icon={Phone} className="col-span-2 sm:col-span-1"><input className={control} type="tel" placeholder="024 XXX XXXX" value={form.phone} onChange={(e) => update("phone", e.target.value)} autoComplete="tel" /></Field>
      <div className="col-span-full"><Field label="Official Email" icon={Mail}><input className={control} type="email" placeholder="you@bawjiasecommunitybank.com" value={form.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" required /></Field></div>
      <Field label="Branch" icon={Building2}><ControlledSelect value={form.branch} onChange={(value) => update("branch", value)} options={portalSettings?.branches || []} placeholder="Select Branch" className={control} contentClassName="max-h-40 border-primary/20 bg-popover/95 shadow-2xl backdrop-blur-xl" /></Field>
      <Field label="Department" icon={BriefcaseBusiness}><ControlledSelect value={form.department} onChange={(value) => update("department", value)} options={portalSettings?.departments || []} placeholder="Select Department" className={control} contentClassName="max-h-40 border-primary/20 bg-popover/95 shadow-2xl backdrop-blur-xl" /></Field>
      <Field label="Password" icon={Lock}><PasswordControl value={form.password} onChange={(value) => update("password", value)} visible={showPassword} toggle={() => setShowPassword((value) => !value)} autoComplete="new-password" /></Field>
      <Field label="Confirm Password" icon={Lock}><PasswordControl value={form.confirmPassword} onChange={(value) => update("confirmPassword", value)} visible={showPassword} toggle={() => setShowPassword((value) => !value)} placeholder="Repeat Password" autoComplete="new-password" /></Field>
      <div className="col-span-full grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/35 px-2.5 py-2">
        {rules.map(([label, valid]) => <span key={String(label)} className={`flex items-center gap-1 text-[9px] font-medium ${valid ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{valid ? <CircleCheck className="h-3 w-3" /> : <CircleX className="h-3 w-3" />}{label}</span>)}
      </div>
      <Button type="submit" disabled={loading || !validPassword || !form.email || !form.branch || !form.department || form.password !== form.confirmPassword} className="glass-button col-span-full h-10 text-xs font-bold uppercase tracking-[0.18em]">
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Create Account"}
      </Button>
    </form>
    <Link to="/login" className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Back to Login</Link>
  </AuthLayout>;
}

function Field({ label, icon: Icon, className = "", children }) {
  return <label className={`min-w-0 ${className}`}><span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-primary">{label}</span><span className="relative block min-w-0">{Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}{children}</span></label>;
}

function PasswordControl({ value, onChange, visible, toggle, placeholder = "Password", autoComplete }) {
  return <div className="relative"><input className={`${control} pr-9`} type={visible ? "text" : "password"} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required /><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={toggle} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button></div>;
}
