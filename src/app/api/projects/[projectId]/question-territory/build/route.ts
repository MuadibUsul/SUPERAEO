import { buildQuestionTerritoryResponse } from "@/app/api/projects/[projectId]/question-territory/route";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "question_territory", operation: "question_territory.build" }, async function POST(_request: Request, context: Context) {
  return buildQuestionTerritoryResponse(context);
});
