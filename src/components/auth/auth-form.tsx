"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
  const isChinese = locale === "zh-CN";
  const context = isChinese
    ? {
        eyebrow: "CIP EVIDENCE WORKSPACE",
        title: "让每一个判断，\n都能回到证据。",
        body: "进入认知审计工作台，查看模型样本、证据来源、统计边界与可验证报告。",
        notes: ["原始回答与结论双向追溯", "低样本与低功效主动降级", "签名报告支持外部验证"],
      }
    : {
        eyebrow: "CIP EVIDENCE WORKSPACE",
        title: "Every conclusion,\nbacked by evidence.",
        body: "Enter the cognition audit workspace to inspect model samples, sources, statistical limits, and verifiable reports.",
        notes: ["Trace claims to original responses", "Automatic low-evidence downgrades", "Externally verifiable signed reports"],
      };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    try {
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

      if (!response.ok) {
        setError(payload?.error ?? (isSignup ? dictionary.auth.signupError : dictionary.auth.loginError));
        return;
      }

      router.push(payload.redirectTo ?? `/${locale}/app/projects`);
    } catch {
      setError(isSignup ? dictionary.auth.signupError : dictionary.auth.loginError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-card/45 shadow-[0_28px_100px_oklch(0_0_0/35%)] md:grid-cols-[1.08fr_0.92fr]">
      <div className="relative hidden min-h-[540px] overflow-hidden border-r border-border p-10 md:flex md:flex-col md:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,oklch(0.82_0.13_205/13%),transparent_32%),linear-gradient(135deg,transparent_55%,oklch(0.72_0.12_300/7%))]" />
        <div className="relative">
          <p className="eyebrow text-primary">{context.eyebrow}</p>
          <h1 className="mt-6 whitespace-pre-line text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-foreground">
            {context.title}
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-dim">{context.body}</p>
        </div>
        <div className="relative space-y-4 border-t border-border pt-6 text-sm text-muted-foreground">
          {context.notes.map((note, index) => {
            const Icon = [Fingerprint, Activity, ShieldCheck][index];
            return (
              <div key={note} className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-primary" />
                <span>{note}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex min-h-[500px] items-center bg-background/35 p-6 sm:p-10 md:p-12">
        <div className="w-full">
          <p className="eyebrow text-primary md:hidden">{context.eyebrow}</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:mt-0">
            {isSignup ? dictionary.auth.signupTitle : dictionary.auth.loginTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isSignup ? dictionary.auth.signupDescription : dictionary.auth.loginDescription}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
          {isSignup ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="name">{dictionary.auth.name}</Label>
                <Input id="name" name="name" autoComplete="name" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="organizationName">{dictionary.auth.organization}</Label>
                <Input
                  id="organizationName"
                  name="organizationName"
                  autoComplete="organization"
                  placeholder={dictionary.auth.organizationPlaceholder}
                />
              </div>
            </>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="email">{dictionary.auth.email}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
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
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSignup ? dictionary.auth.submitSignup : dictionary.auth.submitLogin}
          </Button>
          <Button asChild variant="link" className="w-full text-muted-foreground hover:text-foreground">
            <Link href={`/${locale}/${isSignup ? "login" : "signup"}`}>
              {isSignup ? dictionary.auth.hasAccount : dictionary.auth.noAccount}
            </Link>
          </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
