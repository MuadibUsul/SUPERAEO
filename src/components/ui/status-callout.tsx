import { AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function StatusCallout({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <Card className="border-[oklch(0.85_0.15_85/28%)] bg-[oklch(0.85_0.15_85/6%)]">
      <CardContent className="flex gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[oklch(0.85_0.15_85)]" />
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm text-dim">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
