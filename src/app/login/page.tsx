"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("admin@swiftstrips.local");
  const [password, setPassword] = useState("");
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
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4 py-12">
      <div className="w-full rounded-3xl border border-brand-navy/10 bg-white p-8 shadow-sm ring-1 ring-brand-navy/5">
        <div className="mb-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-navy/60">Swift Strips India</p>
          <h1 className="brand-display mt-2 text-3xl font-semibold text-brand-navy">Senior Checklist</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-brand-navy">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-brand-navy outline-none transition focus:border-brand-navy"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-brand-navy">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-brand-navy/15 bg-brand-cream px-3 py-2.5 text-brand-navy outline-none transition focus:border-brand-navy"
              required
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-navy px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
