import { NextResponse } from "next/server";

import { extractNebulaEvidence } from "@/components/semantic-intelligence/universe-adapter";
import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { asRecord } from "@/server/utils/coerce";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<Context>(
  { subsystem: "semantic_nebula", operation: "semantic_nebula.evidence" },
  async function GET(request: Request, { params }: Context) {
    const auth = await requireApiSession();
    if (!auth.ok) return auth.response;

    const { projectId } = await params;
    const project = await getProject(projectId, auth.session);
    if (project.status !== "ready" || !project.data) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const snapshotId = url.searchParams.get("snapshotId")?.trim() ?? "";
    const nodeKey = url.searchParams.get("node")?.trim() ?? "";
    if (!snapshotId || !nodeKey || snapshotId.length > 128 || nodeKey.length > 512) {
      return NextResponse.json({ error: "Invalid evidence request." }, { status: 400 });
    }

    const rows = await getPrisma().$queryRaw<Array<{ node: unknown }>>`
      WITH snapshot AS (
        SELECT node_json
        FROM semantic_nebula_snapshots
        WHERE id = ${snapshotId} AND project_id = ${projectId}
        LIMIT 1
      )
      SELECT element AS node
      FROM snapshot
      CROSS JOIN LATERAL jsonb_array_elements(snapshot.node_json) AS element
      WHERE COALESCE(element->>'id', element->>'normalizedTerm', element->>'term', '') = ${nodeKey}
      LIMIT 1
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
    }

    return NextResponse.json({ examples: extractNebulaEvidence(asRecord(rows[0].node).examples) });
  },
);
