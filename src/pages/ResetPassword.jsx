import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/AuthLayout";
import { resetPassword } from "@/api/authClient";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(resetToken, newPassword);
      setDone(true);
      setTimeout(() => {
        window.location.href = "/login";
      }, 1800);
    } catch (err) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout className="max-w-[440px] px-6 pb-7 pt-16 sm:px-7">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div>
            <div className="page-kicker text-center">Invalid reset link</div>
            <h1 className="mb-2 mt-3 font-display text-2xl font-bold text-foreground">
              Request a New Link
            </h1>
            <p className="text-sm text-muted-foreground">
              This password reset link is missing or invalid.
            </p>
          </div>
          <Link to="/forgot-password" className="text-sm text-primary transition-smooth hover:text-primary/80">
            Request a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout className="max-w-[440px] px-6 pb-7 pt-16 sm:px-7">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center bg-secondary/80">
            <CheckCircle2 className="h-7 w-7 text-secondary-foreground" />
          </div>
          <div>
            <div className="page-kicker text-center">Password updated</div>
            <h2 className="mb-1 mt-3 font-display text-xl font-bold text-foreground">
              Password Reset!
            </h2>
            <p className="text-sm text-muted-foreground">
              Your password has been updated. Redirecting to sign in...
            </p>
          </div>
          <Link to="/login" className="text-sm text-primary transition-smooth hover:text-primary/80">
            Go to Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout className="max-w-[440px] px-6 pb-7 pt-16 sm:px-7">
      <div className="mb-6 space-y-2 text-center">
        <div className="page-kicker text-center">Secure credentials</div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          New Password
        </h1>
        <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
          Choose a strong password for your account
        </p>
      </div>

      {error && (
        <div className="mb-3 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="new-password"
            className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
          >
            New Password
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="new-password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 12 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-12 glass-input pl-10 pr-10"
              autoComplete="new-password"
              minLength={12}
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-smooth hover:text-foreground"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide" : "Show"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="confirm-password"
            className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
          >
            Confirm Password
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-12 glass-input pl-10 pr-10"
              autoComplete="new-password"
              required
            />
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="mt-1 text-xs text-destructive">Passwords do not match</p>
          )}
        </div>

        <Button
          type="submit"
          className="h-12 w-full glass-button text-sm font-bold uppercase tracking-[0.16em]"
          disabled={loading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Resetting...
            </>
          ) : (
            "Reset Password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
