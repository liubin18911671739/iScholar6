/**
 * Login Page (/(auth)/login)
 *
 * Functionality:
 * - Client login form using Supabase email/password authentication.
 * - Redirects already-authenticated users and successful logins to /dashboard.
 * - Maps auth errors (rate limit, invalid credentials) to localized messages.
 *
 * Notes:
 * - Depends on createSupabaseBrowserClient; degrades gracefully when unconfigured.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Lock, Rocket } from "lucide-react";

/** Email/password login page that authenticates via Supabase and routes onward. */
export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("login");
  const [email, setEmail] = useState("");
  const [password, setPasswordValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Avoid SSR/client hydration mismatch and skip login if a session already exists.
  useEffect(() => {
    setMounted(true);
    fetch("/api/auth/session").then((response) => response.json()).then((session) => {
      if (session?.user) router.push("/dashboard");
    });
  }, [router]);

  if (!mounted) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Rocket className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">iScholar</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  /** Validates the form, signs in with Supabase, and redirects or shows an error. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("邮箱或密码不正确。");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      console.error("Login error:", err);
      const message = err instanceof Error ? err.message : t("error");
      setError(message || t("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Rocket className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">iScholar</CardTitle>
        <CardDescription>{t("tagline")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <div className="relative">
              <Input
                id="password"
                type="password"
                placeholder="输入密码"
                value={password}
                onChange={(e) => setPasswordValue(e.target.value)}
                required
              />
              <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("pleaseWait") : "登录"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
