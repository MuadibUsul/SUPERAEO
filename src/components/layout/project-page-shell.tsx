import { AuditStatusPanel } from "@/components/diagnosis/audit-status-panel";
import { getDictionary } from "@/i18n/dictionaries";

type ProjectPageShellProps = {
  projectId: string;
  locale?: string;
  title: string;
  eyebrow?: string;
  description?: string;
  workflowState?: { competitors: number; keywords: number; queries: number; runs: number; actionItems?: number };
  statusVariant?: "expanded" | "compact";
  children: React.ReactNode;
};

export function ProjectPageShell({ projectId, locale = "zh-CN", title, eyebrow, description, statusVariant = "compact", children }: ProjectPageShellProps) {
  const safeLocale = locale === "en" ? "en" : "zh-CN";
  return <div className="min-w-0 space-y-6">
    <header className="project-heading">
      {eyebrow ? <p className="mb-2 text-xs font-medium text-primary">{eyebrow}</p> : null}
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.035em] sm:text-[32px]">{title}</h1>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </header>
    <AuditStatusPanel projectId={projectId} locale={safeLocale} copy={getDictionary(safeLocale).auditStatus} variant={statusVariant} activityOnly={statusVariant === "compact"} />
    {children}
  </div>;
}
