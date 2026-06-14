"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Competitor = {
  id: string;
  name: string;
  domain: string | null;
  category: string;
};

export function CompetitorManager({
  projectId,
  initialCompetitors,
}: {
  projectId: string;
  initialCompetitors: Competitor[];
}) {
  const [competitors, setCompetitors] = useState(initialCompetitors);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("direct");
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function addCompetitor() {
    if (!name.trim()) {
      setError("Competitor name is required.");
      return;
    }

    setError(null);
    setIsAdding(true);

    const response = await fetch(`/api/projects/${projectId}/competitors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, domain, category }),
    });
    const payload = await response.json().catch(() => null);

    setIsAdding(false);

    if (!response.ok) {
      setError(payload?.error ?? "Competitor could not be added.");
      return;
    }

    setCompetitors((current) => [...current, payload.competitor]);
    setName("");
    setDomain("");
    setCategory("direct");
  }

  async function deleteCompetitor(competitorId: string) {
    setDeletingId(competitorId);
    const response = await fetch(
      `/api/projects/${projectId}/competitors/${competitorId}`,
      { method: "DELETE" },
    );

    setDeletingId(null);

    if (!response.ok) {
      setError("Competitor could not be removed.");
      return;
    }

    setCompetitors((current) =>
      current.filter((competitor) => competitor.id !== competitorId),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Competitor Management</CardTitle>
        <CardDescription>
          Keep the comparison set current before generating keywords and queries.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
          <div className="grid gap-2">
            <Label htmlFor="competitor-name">Name</Label>
            <Input
              id="competitor-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Competitor name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="competitor-domain">Domain</Label>
            <Input
              id="competitor-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="https://competitor.com"
            />
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Competitor category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="adjacent">Adjacent</SelectItem>
                <SelectItem value="alternative">Alternative</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={addCompetitor} disabled={isAdding}>
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {competitors.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-20 text-center text-sm text-muted-foreground"
                  >
                    No competitors added.
                  </TableCell>
                </TableRow>
              ) : (
                competitors.map((competitor) => (
                  <TableRow key={competitor.id}>
                    <TableCell className="font-medium">
                      {competitor.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {competitor.domain || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{competitor.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${competitor.name}`}
                        disabled={deletingId === competitor.id}
                        onClick={() => deleteCompetitor(competitor.id)}
                      >
                        {deletingId === competitor.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
