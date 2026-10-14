import { useState } from "react";
import { supabase, friendlyError } from "../lib/supabase";
import { inputCls, labelCls, primaryBtn } from "../ui";

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-teal-500 text-white text-xl shadow-lg animate-drift">
        🧺
      </div>
      <div className="leading-tight">
        <div className="font-display font-bold text-lg text-ink">Veloxa</div>
        <div className="text-[10px] font-semibold tracking-wide text-teal-500 uppercase">Laundry Management</div>
      </div>
    </div>
  );
}

export function AuthCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Brand />
        </div>
        <div className="card rounded-3xl p-6 sm:p-8 animate-pop">
          <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
          <p className="text-sm text-ink-soft mt-1">{sub}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-4">
          Veloxa Laundry Management, a subsidiary of Veloxa Technology Ltd
        </p>
      </div>
    </div>
  );
}

export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message === "Invalid login credentials" ? "Wrong email or password." : friendlyError(error));
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(friendlyError(error));
      else if (!data.session) setNotice("Check your email for a link to confirm your account, then sign in.");
    }
    setBusy(false);
  };

  return (
    <AuthCard
      title={mode === "signin" ? "Welcome back" : "Start your free trial"}
      sub={
        mode === "signin"
          ? "Sign in to your laundry."
          : "Create an account, then set up your laundry in a minute."
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder={mode === "signup" ? "At least 8 characters" : ""}
          />
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
        {notice && <div className="text-sm text-teal-800 bg-teal-50 rounded-xl px-3 py-2">{notice}</div>}
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
      <div className="text-sm text-ink-soft text-center mt-5">
        {mode === "signin" ? "New to Veloxa? " : "Already have an account? "}
        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="font-semibold text-brand-600 hover:underline"
        >
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </div>
    </AuthCard>
  );
}
