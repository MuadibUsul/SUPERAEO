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
    <Card className="border-warning/30 bg-warning/5">
      <CardContent className="flex gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm text-dim">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
