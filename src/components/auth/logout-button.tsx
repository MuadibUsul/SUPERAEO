"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";

export function LogoutButton({ locale, label }: { locale: Locale; label: string }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign(`/${locale}`);
  }

  return (
    <Button variant="ghost" onClick={logout}>
      <LogOut className="h-4 w-4" />
      {label}
    </Button>
  );
}
