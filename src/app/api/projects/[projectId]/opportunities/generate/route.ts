import { generateOpportunitiesResponse } from "@/app/api/projects/[projectId]/opportunities/route";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "opportunity", operation: "opportunities.generate" }, async function POST(_request: Request, context: Context) {
  return generateOpportunitiesResponse(context);
});
