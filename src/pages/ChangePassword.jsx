import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changeOwnPassword } from '@/api/authClient';
import { useAuth } from '@/lib/AuthContext';
import { firstAllowedPath } from '@/lib/permissions';

export default function ChangePassword() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = form.next.length >= 12 && /[A-Z]/.test(form.next) && /[a-z]/.test(form.next) && /\d/.test(form.next) && /[^A-Za-z0-9]/.test(form.next) && form.next === form.confirm;
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const user = await changeOwnPassword(form.current, form.next); updateUser(user); navigate(firstAllowedPath(user), { replace: true }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <AuthLayout className="flex max-w-md flex-col justify-center px-5 pb-6 pt-16">
    <div className="mb-5 text-center"><KeyRound className="mx-auto h-7 w-7 text-primary" /><h1 className="mt-2 font-display text-2xl font-bold">Create your private password</h1><p className="mt-1 text-sm text-muted-foreground">The temporary password must be replaced before accessing payroll information.</p></div>
    {error && <div className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <form className="space-y-3" onSubmit={submit}>
      <Input type="password" autoComplete="current-password" placeholder="Temporary password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required />
      <Input type="password" autoComplete="new-password" placeholder="New password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required />
      <Input type="password" autoComplete="new-password" placeholder="Confirm new password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
      <p className="text-xs text-muted-foreground">Use at least 12 characters with uppercase, lowercase, number and symbol.</p>
      <Button className="w-full" disabled={!valid || busy}>{busy ? 'Changing password…' : 'Change password'}</Button>
    </form>
  </AuthLayout>;
}
