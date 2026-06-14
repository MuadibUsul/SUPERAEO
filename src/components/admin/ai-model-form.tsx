"use client";

import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reloadCurrentPage } from "@/lib/client/reload";

export function AIModelForm({ providers }: { providers: { id: string; name: string }[] }) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId,
        name: formData.get("name"),
        displayName: formData.get("displayName"),
        enabled: formData.get("enabled") === "on",
        supportsJsonSchema: formData.get("supportsJsonSchema") === "on",
        supportsCitations: formData.get("supportsCitations") === "on",
        supportsWebSearch: formData.get("supportsWebSearch") === "on",
        supportsEmbeddings: formData.get("supportsEmbeddings") === "on",
        defaultForTasks: String(formData.get("defaultForTasks") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    });
    const payload = await response.json().catch(() => null);
    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload?.error ?? "Model could not be saved.");
      return;
    }

    form.reset();
    setProviderId(providers[0]?.id ?? "");
    reloadCurrentPage();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Model</CardTitle>
        <CardDescription>Models inherit provider credentials and expose task capabilities.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Model id</Label>
            <Input id="name" name="name" placeholder="gpt-4.1-mini" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" name="displayName" placeholder="GPT-4.1 mini" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="defaultForTasks">Default tasks</Label>
            <Input id="defaultForTasks" name="defaultForTasks" placeholder="json, sampling" />
          </div>
          <div className="grid gap-2 rounded-md border border-border p-3 text-sm md:col-span-2">
            <label className="flex items-center gap-2">
              <input name="enabled" type="checkbox" defaultChecked className="h-4 w-4" />
              Enabled
            </label>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ["supportsJsonSchema", "JSON schema"],
                ["supportsCitations", "Citations"],
                ["supportsWebSearch", "Web search"],
                ["supportsEmbeddings", "Embeddings"],
              ].map(([name, label]) => (
                <label key={name} className="flex items-center gap-2">
                  <input name={name} type="checkbox" className="h-4 w-4" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
          <div className="md:col-span-2">
            <Button disabled={!providerId || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save model
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
