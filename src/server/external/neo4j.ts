import neo4j, { type Driver } from "neo4j-driver";

let driver: Driver | null = null;

export function isNeo4jConfigured() {
  return Boolean(process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASSWORD);
}

export function getNeo4jDriver() {
  if (!isNeo4jConfigured()) {
    throw new Error("Neo4j is not configured.");
  }

  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!),
    );
  }

  return driver;
}

export async function checkNeo4jHealth() {
  if (!isNeo4jConfigured()) {
    return { ok: false, message: "Neo4j environment variables are not configured." };
  }

  try {
    const session = getNeo4jDriver().session();
    try {
      await session.run("RETURN 1 AS ok");
    } finally {
      await session.close();
    }
    return { ok: true, message: "Neo4j reachable." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Neo4j health check failed.",
    };
  }
}

