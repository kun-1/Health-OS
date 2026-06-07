"use client";

import { useState } from "react";

import { ThemeToggle, getInitialTheme, type Theme } from "@/components/expenses/theme-toggle";

// Wave 3 auth: minimal password form. Server already validated against
// EXPENSES_PASSWORD; client just shows a friendly error and routes back
// to ?redirect= (defaulting to /expenses).

type Props = {
  redirect: string;
};

export function LoginForm({ redirect }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (response.ok) {
        window.location.href = redirect || "/expenses";
        return;
      }
      setError("密码错误");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#17201c]">登录</h1>
        <ThemeToggle onChange={setTheme} theme={theme} />
      </header>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[#5d6963]">
          密码
          <input
            autoFocus
            className="control"
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="EXPENSES_PASSWORD"
            required
            type="password"
            value={password}
          />
        </label>
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        <button
          className="primary-action disabled:opacity-60"
          disabled={busy || password.length === 0}
          type="submit"
        >
          {busy ? "验证中…" : "登录"}
        </button>
        <p className="text-xs text-[#5d6963]">
          这是一个共享密码。凭据在服务器的 <code>EXPENSES_PASSWORD</code> 环境变量中设置。
        </p>
      </form>
    </div>
  );
}
