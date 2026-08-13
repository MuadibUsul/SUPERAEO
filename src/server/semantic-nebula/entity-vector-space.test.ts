import assert from "node:assert/strict";
import test from "node:test";

import { attachEntityVectorPositions } from "@/server/semantic-nebula/entity-vector-space";

test("attaches shared embedding coordinates to overall and model layers", () => {
  const nodes = attachEntityVectorPositions(
    [{ term: "semantic search", models: ["deepseek-chat", "gpt-4.1"] }],
    {
      model: "jina-embeddings-v5-text-small",
      dims: 1024,
      nodes: [{ label: "semantic search", type: "SCENARIO", x: 0.2, y: -0.3, z: 0.4 }],
    },
  );

  assert.deepEqual(nodes[0], {
    term: "semantic search",
    models: ["deepseek-chat", "gpt-4.1"],
    x: 0.2,
    y: -0.3,
    z: 0.4,
    embeddingModel: "jina-embeddings-v5-text-small",
    embeddingDimensions: 1024,
    modelPositions: {
      "deepseek-chat": { x: 0.2, y: -0.3, z: 0.4 },
      "gpt-4.1": { x: 0.2, y: -0.3, z: 0.4 },
    },
  });
});
