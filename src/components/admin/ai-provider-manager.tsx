"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { AIProviderForm } from "@/components/admin/ai-provider-form";
import { ProviderTestButton } from "@/components/admin/provider-test-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reloadCurrentPage } from "@/lib/client/reload";

type ProviderRow = {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string | null;
  defaultModel: string;
  enabled: boolean;
  supportsJsonSchema: boolean;
  supportsCitations: boolean;
  supportsWebSearch: boolean;
  supportsEmbeddings: boolean;
  rateLimitPerMinute: number | null;
  monthlyBudget: number | null;
  apiKeyStatus: "configured" | "not_configured";
  _count: {
    models: number;
    usageLogs: number;
  };
};

export function AIProviderManager({ providers }: { providers: ProviderRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editingProvider = useMemo(
    () => providers.find((provider) => provider.id === editingId) ?? null,
    [editingId, providers],
  );

  async function removeProvider(provider: ProviderRow) {
    const warning =
      provider._count.models > 0
        ? `Delete ${provider.name}? This will also remove ${provider._count.models} linked model record(s).`
        : `Delete ${provider.name}?`;

    if (!window.confirm(warning)) {
      return;
    }

    setDeleteError(null);
    setDeletingId(provider.id);

    const response = await fetch(`/api/admin/ai-providers/${provider.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => null);

    setDeletingId(null);

    if (!response.ok) {
      setDeleteError(payload?.error ?? "Provider could not be deleted.");
      return;
    }

    if (editingId === provider.id) {
      setEditingId(null);
    }

    reloadCurrentPage();
  }

  return (
    <div className="space-y-6">
      <AIProviderForm />

      {editingProvider ? (
        <AIProviderForm
          key={editingProvider.id}
          mode="edit"
          initialValues={editingProvider}
          onCancel={() => setEditingId(null)}
          onSaved={() => setEditingId(null)}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{providers.length} providers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Models</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead className="w-[320px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell className="font-medium">
                    <div>{provider.name}</div>
                    {provider.baseUrl ? (
                      <div className="mt-1 text-xs text-muted-foreground">{provider.baseUrl}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{provider.providerType}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{provider.defaultModel}</TableCell>
                  <TableCell>{provider.enabled ? "Yes" : "No"}</TableCell>
                  <TableCell>{provider.apiKeyStatus === "configured" ? "Configured" : "Missing"}</TableCell>
                  <TableCell className="font-mono">{provider._count.models}</TableCell>
                  <TableCell className="font-mono">{provider._count.usageLogs}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-start gap-2">
                      <ProviderTestButton providerId={provider.id} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingId(provider.id)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deletingId === provider.id}
                        onClick={() => removeProvider(provider)}
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === provider.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
