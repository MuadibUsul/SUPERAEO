"use client";

import { Loader2, PlugZap } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ProviderTestButton({ providerId }: { providerId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function test() {
    setMessage(null);
    setIsLoading(true);
    const response = await fetch(`/api/admin/ai-providers/${providerId}/test`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);
    setIsLoading(false);
    setMessage(payload?.message ?? (response.ok ? "OK" : "Failed"));
  }

  return (
    <div className="space-y-1">
      <Button onClick={test} variant="secondary" disabled={isLoading}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
        Test
      </Button>
      {message ? <p className="max-w-xs text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

