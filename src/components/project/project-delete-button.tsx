"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { reloadCurrentPage } from "@/lib/client/reload";

export function ProjectDeleteButton({
  projectId,
  projectName,
  locale = "zh-CN",
  redirectToProjects = false,
  size = "sm",
  variant = "destructive",
  className,
}: {
  projectId: string;
  projectName: string;
  locale?: string;
  redirectToProjects?: boolean;
  size?: "sm" | "default" | "lg";
  variant?: "destructive" | "outline";
  className?: string;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeProject() {
    const confirmed = window.confirm(
      locale === "zh-CN"
        ? `确认删除项目“${projectName}”吗？该项目下的关键词、查询、采样、报告和分析记录都会被一起删除。`
        : `Delete project "${projectName}"? Its keywords, queries, runs, reports, and analysis records will also be removed.`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setIsDeleting(true);

    const response = await fetch(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => null);

    setIsDeleting(false);

    if (!response.ok) {
      setError(payload?.error ?? "Project could not be deleted.");
      return;
    }

    if (redirectToProjects) {
      router.push(`/${locale}/app/projects`);
      return;
    }

    reloadCurrentPage();
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={isDeleting}
        onClick={removeProject}
      >
        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {locale === "zh-CN" ? (isDeleting ? "删除中..." : "删除项目") : isDeleting ? "Deleting..." : "Delete project"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
