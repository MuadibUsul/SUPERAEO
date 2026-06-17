"use client";

import { Printer, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ReportActions({ exportLabel, shareLabel, copiedLabel }: { exportLabel: string; shareLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" size="sm" onClick={share}>
        <Share2 className="h-4 w-4" />
        {copied ? copiedLabel : shareLabel}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        {exportLabel}
      </Button>
    </div>
  );
}
