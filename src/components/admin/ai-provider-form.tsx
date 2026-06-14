"use client";

import { Loader2, Plus, Save, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reloadCurrentPage } from "@/lib/client/reload";

const providerTypes = [
  "openai_responses",
  "openai_compatible",
  "anthropic_messages",
  "gemini_native",
  "perplexity_sonar",
] as const;

type ProviderFormValues = {
  id?: string;
  name?: string;
  providerType?: string;
  baseUrl?: string | null;
  defaultModel?: string;
  enabled?: boolean;
  supportsJsonSchema?: boolean;
  supportsCitations?: boolean;
  supportsWebSearch?: boolean;
  supportsEmbeddings?: boolean;
  rateLimitPerMinute?: number | null;
  monthlyBudget?: number | null;
};

function normalizeBaseUrlInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return "";
  }

  if (raw.startsWith("ttps://")) {
    return `h${raw}`;
  }

  if (raw.startsWith("tps://")) {
    return `ht${raw}`;
  }

  return raw;
}

function formatProviderError(payload: unknown) {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;

  if (record?.error && typeof record.error === "string" && record.error !== "Invalid provider payload.") {
    return record.error;
  }

  const details =
    record?.details && typeof record.details === "object"
      ? (record.details as Record<string, unknown>)
      : null;
  const fieldErrors =
    details?.fieldErrors && typeof details.fieldErrors === "object"
      ? (details.fieldErrors as Record<string, unknown>)
      : null;

  const firstFieldMessage = fieldErrors
    ? Object.values(fieldErrors)
        .flatMap((value) => (Array.isArray(value) ? value : []))
        .find((value) => typeof value === "string")
    : null;

  if (typeof firstFieldMessage === "string") {
    return firstFieldMessage;
  }

  return typeof record?.error === "string" ? record.error : "Provider could not be saved.";
}

export function AIProviderForm({
  mode = "create",
  initialValues,
  onCancel,
  onSaved,
}: {
  mode?: "create" | "edit";
  initialValues?: ProviderFormValues;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const [providerType, setProviderType] = useState(
    initialValues?.providerType ?? "openai_responses",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = mode === "edit";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const endpoint = isEditing && initialValues?.id ? `/api/admin/ai-providers/${initialValues.id}` : "/api/admin/ai-providers";
    const method = isEditing ? "PATCH" : "POST";
    const normalizedBaseUrl = normalizeBaseUrlInput(formData.get("baseUrl"));

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        providerType,
        baseUrl: normalizedBaseUrl,
        apiKey: formData.get("apiKey"),
        defaultModel: formData.get("defaultModel"),
        enabled: formData.get("enabled") === "on",
        supportsJsonSchema: formData.get("supportsJsonSchema") === "on",
        supportsCitations: formData.get("supportsCitations") === "on",
        supportsWebSearch: formData.get("supportsWebSearch") === "on",
        supportsEmbeddings: formData.get("supportsEmbeddings") === "on",
        rateLimitPerMinute: formData.get("rateLimitPerMinute") || null,
        monthlyBudget: formData.get("monthlyBudget") || null,
      }),
    });
    const payload = await response.json().catch(() => null);
    setIsSubmitting(false);

    if (!response.ok) {
      setError(formatProviderError(payload));
      return;
    }

    if (!isEditing) {
      form.reset();
      setProviderType("openai_responses");
    }

    const baseUrlInput = form.elements.namedItem("baseUrl");
    if (baseUrlInput instanceof HTMLInputElement) {
      baseUrlInput.value = normalizedBaseUrl;
    }

    onSaved?.();
    reloadCurrentPage();
  }

  const deepSeekHint =
    providerType === "openai_responses" &&
    ((initialValues?.baseUrl ?? "").toLowerCase().includes("deepseek") ||
      (initialValues?.name ?? "").toLowerCase().includes("deepseek"));

  const capabilityFields: Array<{
    name: string;
    label: string;
    checked: boolean;
  }> = [
    {
      name: "supportsJsonSchema",
      label: "JSON schema",
      checked: initialValues?.supportsJsonSchema ?? false,
    },
    {
      name: "supportsCitations",
      label: "Citations",
      checked: initialValues?.supportsCitations ?? false,
    },
    {
      name: "supportsWebSearch",
      label: "Web search",
      checked: initialValues?.supportsWebSearch ?? false,
    },
    {
      name: "supportsEmbeddings",
      label: "Embeddings",
      checked: initialValues?.supportsEmbeddings ?? false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit AI Provider" : "Add AI Provider"}</CardTitle>
        <CardDescription>
          API keys are encrypted before storage and only visible to operator roles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${mode}-name`}>Provider name</Label>
            <Input
              id={`${mode}-name`}
              name="name"
              placeholder="OpenAI production"
              required
              defaultValue={initialValues?.name ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label>Provider type</Label>
            <Select value={providerType} onValueChange={setProviderType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${mode}-baseUrl`}>Base URL</Label>
            <Input
              id={`${mode}-baseUrl`}
              name="baseUrl"
              placeholder="https://api.openai.com/v1"
              defaultValue={initialValues?.baseUrl ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${mode}-defaultModel`}>Default model</Label>
            <Input
              id={`${mode}-defaultModel`}
              name="defaultModel"
              placeholder="gpt-4.1-mini"
              required
              defaultValue={initialValues?.defaultModel ?? ""}
            />
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label htmlFor={`${mode}-apiKey`}>API key</Label>
            <Input
              id={`${mode}-apiKey`}
              name="apiKey"
              type="password"
              placeholder={isEditing ? "Leave blank to keep the current encrypted key" : "Stored encrypted"}
            />
          </div>
          {deepSeekHint ? (
            <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-muted-foreground lg:col-span-2">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <p>
                DeepSeek should normally be configured as <code>openai_compatible</code>. Using
                <code> openai_responses</code> will call the wrong endpoint family.
              </p>
            </div>
          ) : null}
          <div className="grid gap-3 rounded-md border border-border p-3 text-sm lg:col-span-2">
            <label className="flex items-center gap-2">
              <input
                name="enabled"
                type="checkbox"
                className="h-4 w-4"
                defaultChecked={initialValues?.enabled ?? false}
              />
              Enabled
            </label>
            <div className="grid gap-2 sm:grid-cols-4">
              {capabilityFields.map((field) => (
                <label key={field.name} className="flex items-center gap-2">
                  <input
                    name={field.name}
                    type="checkbox"
                    className="h-4 w-4"
                    defaultChecked={field.checked}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${mode}-rateLimitPerMinute`}>Rate limit / minute</Label>
            <Input
              id={`${mode}-rateLimitPerMinute`}
              name="rateLimitPerMinute"
              type="number"
              min="1"
              defaultValue={initialValues?.rateLimitPerMinute ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${mode}-monthlyBudget`}>Monthly budget</Label>
            <Input
              id={`${mode}-monthlyBudget`}
              name="monthlyBudget"
              type="number"
              min="0"
              step="0.01"
              defaultValue={initialValues?.monthlyBudget ?? ""}
            />
          </div>
          {error ? <p className="text-sm text-destructive lg:col-span-2">{error}</p> : null}
          <div className="flex gap-3 lg:col-span-2">
            <Button disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEditing ? (
                <Save className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isEditing ? "Save changes" : "Save provider"}
            </Button>
            {isEditing ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
