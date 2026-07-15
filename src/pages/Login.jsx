import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/lib/AuthContext";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { firstAllowedPath as getFirstAllowedPath } from '@/lib/permissions';
import { toast } from '@/components/ui/use-toast';

export default function Login() {
  const navigate = useNavigate();
  const { login, portalSettings } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const message = window.sessionStorage.getItem('bcb_session_message');
    if (message) {
      toast.warning(message, { title: 'Session ended' });
      window.sessionStorage.removeItem('bcb_session_message');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const authenticatedUser = await login(email, password, mfaCode);
      window.sessionStorage.removeItem('bcb_session_message');
      navigate(getFirstAllowedPath(authenticatedUser), { replace: true });
    } catch (err) {
      if (err.mfaRequired) setMfaRequired(true);
      toast.error(err.message || "Invalid email or password", { title: err.mfaRequired ? 'Verification required' : 'Login failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout className="flex flex-col justify-center px-5 pb-4 pt-[3.25rem] sm:px-6 lg:max-w-[395px]">
      <div className="mb-4 space-y-1 text-center">
        <div className="page-kicker text-center">Secure staff access</div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {portalSettings?.portalName || "Finance Payslip Platform"}
        </h1>
        <p className="mx-auto max-w-[17rem] text-xs leading-5 text-muted-foreground">
          {portalSettings?.loginSubtitle || "Sign in to manage staff payroll and payslips"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="space-y-1">
          <Label
            htmlFor="email"
            className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground"
          >
            Official Email
          </Label>
          <div className="relative"><Mail className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input
            id="email"
            type="email"
            placeholder="you@bawjiasecommunitybank.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="glass-input h-10 pl-10 text-sm"
            autoComplete="email"
            autoFocus
            required
          /></div>
        </div>

        {mfaRequired && <div className="space-y-1">
          <Label htmlFor="mfa-code" className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Authenticator Code</Label>
          <Input id="mfa-code" autoComplete="one-time-code" maxLength={10} placeholder="6-digit or recovery code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10))} className="h-9 glass-input text-center text-sm tracking-[0.18em]" autoFocus required />
        </div>}

        <div className="space-y-1">
          <Label
            htmlFor="password"
            className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground"
          >
            Password
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input h-10 pl-10 pr-10 text-sm"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-smooth hover:text-foreground"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 text-xs">
          <Link
            to="/forgot-password"
            className="shrink-0 text-muted-foreground transition-smooth hover:text-primary"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          className="glass-button h-10 w-full text-xs font-bold uppercase tracking-[0.18em]"
          disabled={loading || !email || !password || (mfaRequired && !(/^\d{6}$/.test(mfaCode) || /^[A-F0-9]{4}-?[A-F0-9]{4}$/.test(mfaCode)))}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            portalSettings?.loginButtonText || "Sign In"
          )}
        </Button>
      </form>

      <div className="mt-3 flex gap-2.5 rounded-xl border border-primary/10 bg-primary/[.055] p-3 text-[10px] leading-4 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p><b className="text-foreground">Confidential banking system.</b> Unauthorized access is prohibited. Salary records and user activity are monitored and audited.</p>
      </div>

      <div className="mt-3 text-center">
        <div className="mb-2.5 flex items-center gap-3 text-[10px] text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>or</span><span className="h-px flex-1 bg-border" /></div>
        {portalSettings?.selfRegistrationEnabled !== false && <p className="text-xs text-muted-foreground">
          New staff? <Link to="/register" className="font-bold text-primary underline-offset-4 hover:underline">Create Account</Link>
        </p>}
        <p className="mt-2.5 flex items-center justify-center gap-1.5 border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
          <Lock className="h-3 w-3 text-primary" /> {portalSettings?.authorizedAccessText || "Authorized access only"}
        </p>
      </div>
    </AuthLayout>
  );
}
