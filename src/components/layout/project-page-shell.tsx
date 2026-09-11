import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ProjectWorkflowNav } from "@/components/layout/project-workflow-nav";

type WorkflowState = {
  competitors: number;
  keywords: number;
  queries: number;
  runs: number;
  actionItems?: number;
};

type ProjectPageShellProps = {
  projectId: string;
  locale?: string;
  title: string;
  eyebrow?: string;
  description?: string;
  workflowState?: WorkflowState;
  statusVariant?: "expanded" | "compact";
  children: React.ReactNode;
};

export function ProjectPageShell({
  projectId,
  locale = "zh-CN",
  title,
  eyebrow,
  description,
  workflowState,
  statusVariant = "compact",
  children,
}: ProjectPageShellProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div>
          <Link href={`/${locale}/app/projects`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            {locale === "zh-CN" ? "全部项目" : "All projects"}
          </Link>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            {eyebrow ? (
              <Badge variant="outline" className="h-6 gap-1.5 rounded-md border-border bg-muted/35 px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                {eyebrow}
              </Badge>
            ) : null}
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-[2.4rem]">{title}</h1>
              {description ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <ProjectWorkflowNav projectId={projectId} locale={locale} workflowState={workflowState} statusVariant={statusVariant} />
      </div>
      {children}
    </div>
  );
}
