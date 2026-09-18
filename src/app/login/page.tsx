"use client";

import { signIn } from "next-auth/react";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      remember: String(remember),
      callbackUrl,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    const destination = result?.url ?? callbackUrl;
    const safeDestination = destination.startsWith("http") ? destination : `${window.location.origin}${destination}`;

    window.location.assign(safeDestination);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4 py-12">
      <div className="w-full border-[3px] border-ink bg-white p-7 neo-shadow-lg">
        <div className="mb-8 text-center">
          <span className="sticker bg-hot-pink text-ink">Swift Strips India</span>
          <h1 className="brand-display mt-4 text-4xl text-ink">Senior Checklist</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="neo-border w-full bg-paper px-3 py-3 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-ink/75">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="neo-border w-full bg-paper px-3 py-3 text-sm text-ink outline-none focus:shadow-[4px_4px_0_0_var(--ink)]"
              required
            />
          </div>

          <label className="flex items-center gap-3 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-4 w-4 border-[3px] border-ink bg-paper accent-electric-lime"
            />
            Remember me
          </label>

          {error ? (
            <div className="border-[3px] border-ink bg-hot-pink px-3 py-2 text-sm font-semibold text-ink">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="neo-press neo-border w-full bg-electric-lime px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-ink disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
