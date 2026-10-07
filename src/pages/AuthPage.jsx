import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { C, Btn, Field, Input, ErrorBox, Spinner } from '../ui';

export default function AuthPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { checkAppState, isAuthenticated } = useAuth();
  const [mode, setMode] = useState(params.get('mode') === 'login' ? 'login' : 'signup');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const next = params.get('next');
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/profile';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (isAuthenticated) {
    return (
      <div className={`${C.card} max-w-md mx-auto p-6 text-center space-y-4`}>
        <div className="font-black text-xl">You're signed in</div>
        <Btn onClick={() => nav(dest)}>Continue</Btn>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (mode === 'signup') await auth.register(form.email.trim(), form.password, form.name.trim() || undefined);
      else await auth.login(form.email.trim(), form.password);
      await checkAppState();
      nav(mode === 'signup' && dest === '/profile' ? '/profile?welcome=1' : dest, { replace: true });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto space-y-5 pt-4">
      <div className="text-center space-y-1.5">
        <h1 className="text-3xl font-black tracking-tight">{mode === 'signup' ? 'Start your recruiting journey' : 'Welcome back'}</h1>
        <p className="text-slate-400 text-sm">{mode === 'signup' ? 'One account for the player and her family. Your list, notes and contact history stay private to you.' : 'Sign in to open your recruiting list.'}</p>
      </div>
      <form onSubmit={submit} className={`${C.card} p-5 space-y-4`}>
        {mode === 'signup' && <Field label="Player or parent name"><Input value={form.name} onChange={set('name')} placeholder="e.g. Ava Stone" autoComplete="name" /></Field>}
        <Field label="Email"><Input type="email" required value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" /></Field>
        <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
          <Input type="password" required minLength={6} value={form.password} onChange={set('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        </Field>
        <ErrorBox error={error} />
        <Btn type="submit" size="lg" className="w-full" disabled={busy}>{busy && <Spinner className="w-4 h-4" />}{mode === 'signup' ? 'Create account' : 'Sign in'}</Btn>
        {mode === 'signup' && <p className="text-xs text-slate-500 text-center">Your list, notes and contact history are private to your account.</p>}
      </form>
      <button type="button" className="block mx-auto text-sm text-red-400 font-semibold" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null); }}>
        {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </div>
  );
}
