"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword(length = 10): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => ALPHABET[value % ALPHABET.length]).join("");
}

const fieldClass = "mt-1 block min-h-11 w-full border-[3px] border-ink bg-paper px-3 py-2 text-sm font-bold text-ink";
const labelClass = "text-xs font-black uppercase tracking-[0.16em] text-ink";

export function CreateUserForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ loginId: string; password: string } | null>(null);

  async function onSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, loginId, password, role, phone }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message ?? "Could not create the user");
        return;
      }
      setCreated({ loginId: data.user.loginId, password });
      setName("");
      setLoginId("");
      setPassword("");
      setPhone("");
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 border-[3px] border-ink bg-white p-5 neo-shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className={fieldClass} autoComplete="off" />
        </label>
        <label className={labelClass}>
          User id
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} required minLength={3} className={fieldClass} autoComplete="off" placeholder="rahul.k  or  rahul@company.com" />
        </label>
        <label className={labelClass}>
          Password
          <div className="flex gap-2">
            <input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={fieldClass} autoComplete="new-password" />
            <button type="button" onClick={() => setPassword(generatePassword())} className="neo-press mt-1 min-h-11 shrink-0 border-[3px] border-ink bg-sun-yellow px-3 text-xs font-bold text-ink">Generate</button>
          </div>
        </label>
        <label className={labelClass}>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)} className={fieldClass}>
            <option value="EMPLOYEE">Employee</option>
            <option value="SENIOR">Senior</option>
            <option value="MANAGER">Manager</option>
          </select>
        </label>
        <label className={labelClass}>
          Phone (optional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} autoComplete="off" inputMode="tel" />
        </label>
      </div>

      {error ? <p role="alert" className="border-[3px] border-ink bg-hot-pink p-3 text-sm font-bold text-ink">{error}</p> : null}
      {created ? (
        <div role="status" className="border-[3px] border-ink bg-brand-green p-3 text-sm font-bold text-ink">
          User created. Share these now — the password is not shown again.
          <p className="mt-2 font-mono">User id: {created.loginId}</p>
          <p className="font-mono">Password: {created.password}</p>
        </div>
      ) : null}

      <button type="submit" disabled={busy} className="neo-press min-h-11 border-[3px] border-ink bg-electric-lime px-5 py-2 text-sm font-bold text-ink disabled:opacity-60">
        {busy ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
