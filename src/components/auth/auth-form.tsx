"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export function AuthForm({ mode, locale }: { mode: "login" | "signup"; locale: Locale }) {
  const dictionary = getDictionary(locale);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === "signup";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
        name: formData.get("name"),
        organizationName: formData.get("organizationName"),
        locale,
      }),
    });
    const payload = await response.json().catch(() => null);
    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload?.error ?? (isSignup ? dictionary.auth.signupError : dictionary.auth.loginError));
      return;
    }

    router.push(payload.redirectTo ?? `/${locale}/app/projects`);
  }

  return (
    <Card className="w-full max-w-md border-white/10 bg-white/[0.045] text-white shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur">
      <CardHeader>
        <CardTitle>{isSignup ? dictionary.auth.signupTitle : dictionary.auth.loginTitle}</CardTitle>
        <CardDescription className="text-white/58">
          {isSignup ? dictionary.auth.signupDescription : dictionary.auth.loginDescription}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {isSignup ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="name">{dictionary.auth.name}</Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  className="border-white/12 bg-black/20 text-white"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="organizationName">{dictionary.auth.organization}</Label>
                <Input
                  id="organizationName"
                  name="organizationName"
                  autoComplete="organization"
                  placeholder={dictionary.auth.organizationPlaceholder}
                  className="border-white/12 bg-black/20 text-white placeholder:text-white/28"
                />
              </div>
            </>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="email">{dictionary.auth.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="border-white/12 bg-black/20 text-white"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{dictionary.auth.password}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={8}
              className="border-white/12 bg-black/20 text-white"
            />
          </div>
          {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          <Button type="submit" className="w-full bg-amber-100 text-slate-950 hover:bg-amber-50" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSignup ? dictionary.auth.submitSignup : dictionary.auth.submitLogin}
          </Button>
          <Button asChild variant="link" className="w-full text-white/64 hover:text-white">
            <Link href={`/${locale}/${isSignup ? "login" : "signup"}`}>
              {isSignup ? dictionary.auth.hasAccount : dictionary.auth.noAccount}
            </Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
