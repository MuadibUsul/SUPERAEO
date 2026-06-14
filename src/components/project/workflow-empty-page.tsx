import { EmptyState } from "@/components/ui/empty-state";

export function WorkflowEmptyPage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return <EmptyState title={title} message={message} />;
}
