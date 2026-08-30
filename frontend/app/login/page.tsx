"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { googleLoginUrl, getCurrentUser } from "@/lib/api";
import { ToastStack, useToasts } from "@/components/Toast";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.7 35 27 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.6 5.6C41.8 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get("error");
  const [checking, setChecking] = useState(true);
  const { toasts, push } = useToasts();

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        if (user) router.replace("/dashboard");
      })
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[380px] rounded-2xl border border-slate-200 p-8 shadow-sm">
        <h1 className="mb-6 text-center text-3xl font-bold text-slate-900">Login</h1>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
            Sign-in failed. Please try again.
          </p>
        )}

        <a href={googleLoginUrl()} className="block">
          <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-50 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-brand-100">
            <GoogleIcon />
            Login with Google
          </button>
        </a>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="text-xs text-slate-400">or sign up through email</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            push("Email/password login isn't available in this build — continue with Google above.", "error");
          }}
        >
          <input
            type="email"
            placeholder="Email ID"
            className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand-100"
          />
          <input
            type="password"
            placeholder="Password"
            className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            className="mt-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Login
          </button>
        </form>
      </div>
      <ToastStack toasts={toasts} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
