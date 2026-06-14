import { buildNebulaResponse } from "@/app/api/projects/[projectId]/semantic-nebula/route";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "semantic_nebula", operation: "semantic_nebula.build" }, async function POST(_request: Request, context: Context) {
  return buildNebulaResponse(context);
});
