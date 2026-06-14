import { getPrisma } from "@/server/db";

export async function createSemanticCoverageSnapshot(projectId: string) {
  const prisma = getPrisma();
  const [keywords, queries, responses] = await Promise.all([
    prisma.semanticKeyword.findMany({ where: { projectId } }),
    prisma.aeoQuery.findMany({ where: { projectId } }),
    prisma.aIResponse.findMany({
      where: { run: { projectId } },
      include: { analysis: true },
    }),
  ]);

  const matchedKeywords = new Set<string>();
  for (const response of responses) {
    const values = response.analysis?.matchedKeywords;
    if (Array.isArray(values)) {
      for (const value of values) {
        if (typeof value === "string") {
          matchedKeywords.add(value.toLowerCase());
        }
      }
    }
  }

  const keywordCount = Math.max(1, keywords.length);
  const topicBreadth = Math.min(1, matchedKeywords.size / keywordCount);
  const queryTypes = new Set(queries.map((query) => query.queryType));
  const intentCoverage = Math.min(1, queryTypes.size / 8);
  const topicDepth = responses.length ? Math.min(1, responses.length / Math.max(1, queries.length * 2)) : 0;
  const vocabularyDiversity = Math.min(1, new Set(keywords.map((keyword) => keyword.keyword.split(" ")[0]?.toLowerCase())).size / keywordCount);
  const overallCoverage = 0.35 * topicBreadth + 0.25 * topicDepth + 0.25 * intentCoverage + 0.15 * vocabularyDiversity;
  const missingConcepts = keywords
    .filter((keyword) => !matchedKeywords.has(keyword.keyword.toLowerCase()))
    .slice(0, 12)
    .map((keyword) => ({
      keyword: keyword.keyword,
      keywordType: keyword.keywordType,
      targetWeight: keyword.targetWeight,
    }));

  return prisma.semanticCoverageSnapshot.create({
    data: {
      projectId,
      topicBreadth,
      topicDepth,
      intentCoverage,
      vocabularyDiversity,
      overallCoverage,
      missingConcepts,
      competitorGaps: [],
      evidence: {
        keywordCount: keywords.length,
        queryCount: queries.length,
        responseCount: responses.length,
      },
    },
  });
}

