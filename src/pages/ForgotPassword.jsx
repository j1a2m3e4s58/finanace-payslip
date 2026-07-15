import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/AuthLayout";
import { requestPasswordReset } from "@/api/authClient";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send reset link");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout className="max-w-[440px] px-6 pb-7 pt-16 sm:px-7">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center bg-secondary/80">
            <CheckCircle2 className="h-7 w-7 text-secondary-foreground" />
          </div>
          <div>
            <div className="page-kicker text-center">Reset requested</div>
            <h2 className="mb-1 mt-3 font-display text-xl font-bold text-foreground">
              Check Your Email
            </h2>
            <p className="text-sm text-muted-foreground">
              We sent a password reset link to{" "}
              <strong className="text-foreground">{email}</strong>
            </p>
          </div>
          <p className="max-w-xs text-xs text-muted-foreground">
            The link expires in 30 minutes. If you do not see it, check your spam folder.
          </p>
          <Link
            to="/login"
            className="mt-2 flex items-center gap-1.5 text-sm text-primary transition-smooth hover:text-primary/80"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout className="max-w-[440px] px-6 pb-7 pt-16 sm:px-7">
      <div className="mb-6 space-y-2 text-center">
        <div className="page-kicker text-center">Account recovery</div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Reset Password
        </h1>
        <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
          Enter your official email to receive a reset link
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
            htmlFor="email"
            className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
          >
            Official Email Address
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@bawjiasecommunitybank.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 glass-input pl-10"
              autoComplete="email"
              autoFocus
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          className="h-12 w-full glass-button text-sm font-bold uppercase tracking-[0.16em]"
          disabled={loading || !email}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send Reset Link"
          )}
        </Button>
      </form>

      <div className="mt-6 border-t border-border/40 pt-5 text-center">
        <Link
          to="/login"
          className="flex items-center justify-center gap-1.5 text-sm text-primary transition-smooth hover:text-primary/80"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}
