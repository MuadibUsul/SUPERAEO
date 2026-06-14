"use client";

import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { reloadCurrentPage } from "@/lib/client/reload";

const promptTaskOptions = [
  "semantic_keyword_generator",
  "query_generator",
  "answer_extractor",
  "long_tail_scenario_generation",
  "question_cluster_generation",
  "opportunity_answer_extraction",
  "semantic_term_extraction",
  "semantic_term_classification",
];

export function PromptTemplateForm() {
  const [locale, setLocale] = useState("en");
  const [status, setStatus] = useState("active");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/admin/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        task: formData.get("task"),
        version: formData.get("version"),
        locale,
        status,
        content: formData.get("content"),
      }),
    });
    const payload = await response.json().catch(() => null);
    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload?.error ?? "Prompt template could not be saved.");
      return;
    }

    form.reset();
    setLocale("en");
    setStatus("active");
    reloadCurrentPage();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Prompt Template</CardTitle>
        <CardDescription>Versioned templates keep generation behavior auditable.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="semantic_keyword_generator" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task">Task</Label>
            <Input id="task" name="task" list="prompt-task-options" placeholder="long_tail_scenario_generation" required />
            <datalist id="prompt-task-options">
              {promptTaskOptions.map((task) => (
                <option key={task} value={task} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="version">Version</Label>
            <Input id="version" name="version" placeholder="2026-05-18.v1" required />
          </div>
          <div className="grid gap-2">
            <Label>Locale</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">en</SelectItem>
                <SelectItem value="zh-CN">zh-CN</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="inactive">inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="content">Content</Label>
            <Textarea id="content" name="content" rows={6} required />
          </div>
          {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
          <div className="md:col-span-2">
            <Button disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save template
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
