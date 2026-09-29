"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { APP_COPY } from "@/lib/copy";

export const dynamic = "force-dynamic";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    // Show message if redirected after signup
    if (searchParams.get("registered") === "1") {
      setSuccessMsg("Account created! Check your email to confirm, then log in.");
    }
  }, [searchParams]);

  const performLogin = async (loginEmail: string, loginPass: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPass,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.session) {
        setError("Login succeeded but no session was created. Try again.");
        return;
      }

      // Hard redirect to ensure new cookies are passed to edge middleware and server components
      window.location.href = redirectTo;
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  const loginAsDemo = async (demoEmail: string, demoRole: "tenant" | "owner") => {
    setEmail(demoEmail);
    setPassword("DemoPassword123!");
    await performLogin(demoEmail, "DemoPassword123!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Logo & Brand */}
        <div className="text-center space-y-3">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform">
              <Camera className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="font-extrabold text-xl tracking-tight text-foreground">
                {APP_COPY.name}
              </div>
              <div className="text-xs text-muted-foreground">Visual Property Memory</div>
            </div>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to access your property inspections
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-md space-y-6">
          {/* Quick Demo Logins */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Quick Demo Personas (1-Click)
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                id="demo-login-tenant-btn"
                onClick={() => loginAsDemo("alex.tenant@rentalmove.demo", "tenant")}
                disabled={isLoading}
                className="flex flex-col items-start p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-left transition-all group disabled:opacity-50"
              >
                <span className="text-[10px] font-bold text-primary uppercase tracking-wide">
                  Tenant
                </span>
                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  Alex Chen
                </span>
                <span className="text-[10px] text-muted-foreground truncate w-full">
                  #381 Elmwood Ave
                </span>
              </button>

              <button
                type="button"
                id="demo-login-owner-btn"
                onClick={() => loginAsDemo("sarah.owner@rentalmove.demo", "owner")}
                disabled={isLoading}
                className="flex flex-col items-start p-3 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 text-left transition-all group disabled:opacity-50"
              >
                <span className="text-[10px] font-bold text-accent uppercase tracking-wide">
                  Owner
                </span>
                <span className="text-xs font-semibold text-foreground group-hover:text-accent transition-colors">
                  Sarah Jenkins
                </span>
                <span className="text-[10px] text-muted-foreground truncate w-full">
                  Portfolio Manager
                </span>
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-card text-muted-foreground">or sign in with email</span>
            </div>
          </div>

          {/* Success message */}
          {successMsg && (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-foreground"
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-foreground"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-12 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/25 transition-all active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign in
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-card text-muted-foreground">Don&apos;t have an account?</span>
            </div>
          </div>

          {/* Sign up link */}
          <Link
            href="/signup"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-secondary/60 transition-colors"
          >
            Create a free account
          </Link>
        </div>

        {/* Trust signal */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" />
          <span>Secured by Supabase Auth · All data encrypted</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginForm />
    </Suspense>
  );
}
