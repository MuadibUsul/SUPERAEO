import { AlertCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type EmptyStateProps = {
  title: string;
  message: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex min-h-48 flex-col items-start justify-center gap-4 p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {message}
          </p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
