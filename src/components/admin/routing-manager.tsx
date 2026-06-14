"use client";

import type React from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reloadCurrentPage } from "@/lib/client/reload";

type PolicyRow = {
  id: string;
  task: string;
  tier: string;
  enabled: boolean;
  executionStrategy: string;
  providerSelection: string;
  laneCount: number;
  minLaneCount: number;
  maxLaneCount: number;
  targetLatencySeconds: number;
  timeoutSeconds: number;
};

type RuleRow = {
  id: string;
  task: string;
  tier: string;
  enabled: boolean;
  priority: number;
  provider: { id: string; name: string; providerType: string };
  model: { id: string; name: string; displayName: string | null } | null;
};

type ProviderOption = { id: string; name: string };
type ModelOption = { id: string; name: string; displayName: string | null; providerId: string };

const taskLabels: Record<string, string> = {
  semantic_keyword_generator: "Semantic keyword generation",
  query_generator: "Query generation",
  answer_sampling: "Answer sampling",
  long_tail_scenario_generation: "Long-tail scenario generation",
  question_cluster_generation: "Question cluster generation",
  opportunity_answer_extraction: "Opportunity answer extraction",
  semantic_term_extraction: "Semantic term extraction",
  semantic_term_classification: "Semantic term classification",
  semantic_nebula_build: "Semantic nebula build",
  long_tail_opportunity_generation: "Long-tail opportunity generation",
  question_territory_build: "Question territory build",
  opportunity_probe_sampling: "Opportunity probe sampling",
};

export function RoutingManager({
  policies,
  rules,
  providers,
  models,
}: {
  policies: PolicyRow[];
  rules: RuleRow[];
  providers: ProviderOption[];
  models: ModelOption[];
}) {
  return (
    <div className="space-y-6">
      <PolicyManager policies={policies} />
      <RuleManager rules={rules} providers={providers} models={models} />
    </div>
  );
}

function PolicyManager({ policies }: { policies: PolicyRow[] }) {
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function savePolicy(formData: FormData) {
    const task = String(formData.get("task") || "");
    setSavingTask(task);
    setError(null);

    const response = await fetch("/api/admin/provider-routing/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task,
        tier: formData.get("tier"),
        enabled: formData.get("enabled") === "on",
        executionStrategy: formData.get("executionStrategy"),
        providerSelection: formData.get("providerSelection"),
        laneCount: formData.get("laneCount"),
        minLaneCount: formData.get("minLaneCount"),
        maxLaneCount: formData.get("maxLaneCount"),
        targetLatencySeconds: formData.get("targetLatencySeconds"),
        timeoutSeconds: formData.get("timeoutSeconds"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setSavingTask(null);

    if (!response.ok) {
      setError(payload?.error ?? "Execution policy could not be saved.");
      return;
    }

    reloadCurrentPage();
  }

  return (
    <Card>
      <CardHeader>
        <Badge variant="secondary">Execution Policy</Badge>
        <CardTitle className="mt-3">Concurrency Control</CardTitle>
        <CardDescription>
          Control how many parallel lanes each AI task can open, which routing tier it uses, and how providers are spread across lanes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {policies.map((policy) => (
          <form
            key={policy.task}
            onSubmit={(event) => {
              event.preventDefault();
              void savePolicy(new FormData(event.currentTarget));
            }}
            className="rounded-2xl border border-border/70 bg-background/40 p-4"
          >
            <input type="hidden" name="task" value={policy.task} />
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h3 className="text-base font-semibold">{taskLabels[policy.task] ?? policy.task}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {policy.task === "query_generator"
                    ? "Split the query library across multiple lanes and merge validated results."
                    : policy.task === "semantic_keyword_generator"
                      ? "Shard keyword generation by concept families before merging into the final semantic frame."
                      : policy.task === "answer_sampling"
                        ? "Run multiple answer samples in parallel with provider-level spreading and unified analysis."
                        : "Route semantic intelligence tasks through auditable provider policies without bypassing JSON validation."}
                </p>
              </div>
              <Button type="submit" size="sm" disabled={savingTask === policy.task}>
                {savingTask === policy.task ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save policy
              </Button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Routing tier">
                <Select name="tier" defaultValue={policy.tier}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low_cost_sampling">low_cost_sampling</SelectItem>
                    <SelectItem value="mid_tier_verification">mid_tier_verification</SelectItem>
                    <SelectItem value="high_fidelity_audit">high_fidelity_audit</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Strategy">
                <Select name="executionStrategy" defaultValue={policy.executionStrategy}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_lane">single_lane</SelectItem>
                    <SelectItem value="sharded_parallel">sharded_parallel</SelectItem>
                    <SelectItem value="adaptive_parallel">adaptive_parallel</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Provider spread">
                <Select name="providerSelection" defaultValue={policy.providerSelection}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary_only">primary_only</SelectItem>
                    <SelectItem value="round_robin">round_robin</SelectItem>
                    <SelectItem value="priority_spread">priority_spread</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                <input name="enabled" type="checkbox" defaultChecked={policy.enabled} className="h-4 w-4" />
                Enabled
              </label>
              <Field label="Default lanes">
                <Input name="laneCount" type="number" min="1" max="16" defaultValue={policy.laneCount} />
              </Field>
              <Field label="Min lanes">
                <Input name="minLaneCount" type="number" min="1" max="16" defaultValue={policy.minLaneCount} />
              </Field>
              <Field label="Max lanes">
                <Input name="maxLaneCount" type="number" min="1" max="16" defaultValue={policy.maxLaneCount} />
              </Field>
              <Field label="Target latency (sec)">
                <Input name="targetLatencySeconds" type="number" min="15" max="600" defaultValue={policy.targetLatencySeconds} />
              </Field>
              <Field label="Task timeout (sec)">
                <Input name="timeoutSeconds" type="number" min="15" max="600" defaultValue={policy.timeoutSeconds} />
              </Field>
            </div>
          </form>
        ))}
      </CardContent>
    </Card>
  );
}

function RuleManager({
  rules,
  providers,
  models,
}: {
  rules: RuleRow[];
  providers: ProviderOption[];
  models: ModelOption[];
}) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modelOptions = useMemo(
    () => models.filter((model) => model.providerId === providerId),
    [models, providerId],
  );
  const modelUnsetValue = "__provider_default__";

  async function createRule(formData: FormData) {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/admin/provider-routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: formData.get("task"),
        tier: formData.get("tier"),
        providerId,
        modelId: formData.get("modelId") === modelUnsetValue ? "" : formData.get("modelId"),
        enabled: formData.get("enabled") === "on",
        priority: formData.get("priority"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(payload?.error ?? "Routing rule could not be saved.");
      return;
    }
    reloadCurrentPage();
  }

  async function deleteRule(ruleId: string) {
    if (!window.confirm("Delete this routing rule?")) {
      return;
    }

    setDeletingRuleId(ruleId);
    setError(null);
    const response = await fetch(`/api/admin/provider-routing/${ruleId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    setDeletingRuleId(null);
    if (!response.ok) {
      setError(payload?.error ?? "Routing rule could not be deleted.");
      return;
    }
    reloadCurrentPage();
  }

  return (
    <Card>
      <CardHeader>
        <Badge variant="secondary">Provider Router</Badge>
        <CardTitle className="mt-3">Lane-to-Provider Rules</CardTitle>
        <CardDescription>
          Define which providers and models are eligible for each task and tier. The execution policy decides lane count; these rules decide where lanes are sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createRule(new FormData(event.currentTarget));
          }}
          className="grid gap-4 rounded-2xl border border-border/70 bg-background/40 p-4 md:grid-cols-2 xl:grid-cols-6"
        >
          <Field label="Task">
            <Select name="task" defaultValue="query_generator">
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(taskLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tier">
            <Select name="tier" defaultValue="mid_tier_verification">
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low_cost_sampling">low_cost_sampling</SelectItem>
                <SelectItem value="mid_tier_verification">mid_tier_verification</SelectItem>
                <SelectItem value="high_fidelity_audit">high_fidelity_audit</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Provider">
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Model">
            <Select name="modelId" defaultValue={modelUnsetValue}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Provider default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={modelUnsetValue}>Provider default</SelectItem>
                {modelOptions.map((model) => (
                  <SelectItem key={model.id} value={model.id}>{model.displayName ?? model.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority">
            <Input name="priority" type="number" min="1" defaultValue={100} />
          </Field>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
              <input name="enabled" type="checkbox" defaultChecked className="h-4 w-4" />
              Enabled
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add rule
            </Button>
          </div>
        </form>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>{taskLabels[rule.task] ?? rule.task}</TableCell>
                <TableCell>{rule.tier}</TableCell>
                <TableCell>{rule.provider.name}</TableCell>
                <TableCell>{rule.model?.displayName ?? rule.model?.name ?? "Provider default"}</TableCell>
                <TableCell className="font-mono">{rule.priority}</TableCell>
                <TableCell>{rule.enabled ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deletingRuleId === rule.id}
                    onClick={() => deleteRule(rule.id)}
                  >
                    {deletingRuleId === rule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
