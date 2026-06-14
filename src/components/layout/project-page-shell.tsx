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
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            {eyebrow ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-[oklch(0.85_0.15_85/25%)] bg-[oklch(0.85_0.15_85/10%)] text-[oklch(0.85_0.15_85)]"
              >
                <span className="size-1.5 rounded-full bg-[oklch(0.85_0.15_85)]" />
                {eyebrow}
              </Badge>
            ) : null}
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
              {description ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-dim">
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
