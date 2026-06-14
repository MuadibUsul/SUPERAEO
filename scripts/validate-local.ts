import "dotenv/config";

import IORedis from "ioredis";

import { verifyPassword } from "@/server/auth/password";
import { getPrisma, isDatabaseConfigured } from "@/server/db";

type CheckStatus = "pass" | "warn" | "fail";

type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
};

const checks: Check[] = [];
const baseUrl = process.env.VALIDATE_BASE_URL ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";

function record(status: CheckStatus, name: string, detail: string) {
  checks.push({ status, name, detail });
}

async function main() {
  await checkDatabaseAndSeedUsers();
  await checkRedis();
  await checkOptionalServices();
  await checkHttpFlows();

  printSummary();

  if (checks.some((check) => check.status === "fail")) {
    process.exit(1);
  }
}

async function checkDatabaseAndSeedUsers() {
  if (!isDatabaseConfigured()) {
    record("fail", "DATABASE_URL", "DATABASE_URL is missing or still uses a placeholder.");
    return;
  }

  const prisma = getPrisma();
  try {
    await prisma.$queryRawUnsafe("select 1");
    record("pass", "PostgreSQL", "Database connection succeeded.");

    const expectedUsers = [
      { email: "operator@aeo.local", password: "Operator@123456", role: "platform_owner" },
      { email: "demo@observable-ai.local", password: "Customer@123456", role: "customer_owner" },
    ] as const;

    for (const expected of expectedUsers) {
      const user = await prisma.user.findUnique({ where: { email: expected.email } });
      if (!user?.passwordHash) {
        record("fail", `Seed user ${expected.email}`, "User is missing or has no password hash.");
        continue;
      }

      const passwordOk = await verifyPassword(expected.password, user.passwordHash);
      const roleOk = user.role === expected.role;
      if (passwordOk && roleOk) {
        record("pass", `Seed user ${expected.email}`, `Password and role are valid (${user.role}).`);
      } else {
        record(
          "fail",
          `Seed user ${expected.email}`,
          `Expected role ${expected.role}; got ${user.role}. Password valid: ${passwordOk}.`,
        );
      }
    }

    const failedJobs = await prisma.analysisJob.count({ where: { status: "failed" } });
    if (failedJobs > 0) {
      record("warn", "AnalysisJob failures", `${failedJobs} failed job(s) exist in local history.`);
    } else {
      record("pass", "AnalysisJob failures", "No failed jobs in local history.");
    }
  } catch (error) {
    record("fail", "PostgreSQL", error instanceof Error ? error.message : "Database check failed.");
  } finally {
    await prisma.$disconnect().catch(() => null);
  }
}

async function checkRedis() {
  if (!process.env.REDIS_URL) {
    record("fail", "REDIS_URL", "REDIS_URL is required for queue-backed local validation.");
    return;
  }

  const redis = new IORedis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
  try {
    await redis.connect();
    const pong = await redis.ping();
    record(pong === "PONG" ? "pass" : "fail", "Redis", `Ping returned ${pong}.`);
  } catch (error) {
    record("fail", "Redis", error instanceof Error ? error.message : "Redis check failed.");
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

async function checkOptionalServices() {
  const optionalServices = [
    { name: "Qdrant", keys: ["QDRANT_URL"] },
    { name: "Neo4j", keys: ["NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"] },
    { name: "Object storage", keys: ["OBJECT_STORAGE_ENDPOINT", "OBJECT_STORAGE_BUCKET"] },
    { name: "Cognitive service", keys: ["COGNITIVE_SERVICE_URL"] },
  ];

  for (const service of optionalServices) {
    const configured = service.keys.every((key) => Boolean(process.env[key]));
    record(
      configured ? "pass" : "warn",
      service.name,
      configured ? "Configured in environment." : "Not configured. This is acceptable for core local validation.",
    );
  }
}

async function checkHttpFlows() {
  try {
    const home = await fetch(`${baseUrl}/zh-CN`, { redirect: "manual" });
    if (home.ok) {
      record("pass", "Public homepage", `${baseUrl}/zh-CN returned ${home.status}.`);
    } else {
      record("fail", "Public homepage", `${baseUrl}/zh-CN returned ${home.status}.`);
      return;
    }
  } catch (error) {
    record(
      "fail",
      "Public homepage",
      `Could not reach ${baseUrl}. Start the dev server with npm run dev. ${formatError(error)}`,
    );
    return;
  }

  const customer = await login("demo@observable-ai.local", "Customer@123456", "zh-CN");
  if (customer.cookie) {
    await checkProtectedPage("Customer projects", `${baseUrl}/zh-CN/app/projects`, customer.cookie);
  }

  const operator = await login("operator@aeo.local", "Operator@123456", "zh-CN");
  if (operator.cookie) {
    await checkProtectedPage("Operator admin", `${baseUrl}/zh-CN/admin`, operator.cookie);
    await checkAdminHealth(operator.cookie);
  }
}

async function login(email: string, password: string, locale: "zh-CN" | "en") {
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, locale }),
    });
    const body = await response.json().catch(() => null);
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? null;

    if (response.ok && cookie) {
      record("pass", `HTTP login ${email}`, `Login returned ${response.status}; redirectTo=${body?.redirectTo ?? "unknown"}.`);
      return { cookie };
    }

    record("fail", `HTTP login ${email}`, `Login returned ${response.status}: ${JSON.stringify(body)}`);
    return { cookie: null };
  } catch (error) {
    record("fail", `HTTP login ${email}`, formatError(error));
    return { cookie: null };
  }
}

async function checkProtectedPage(name: string, url: string, cookie: string) {
  try {
    const response = await fetch(url, { headers: { cookie } });
    record(response.ok ? "pass" : "fail", name, `${url} returned ${response.status}.`);
  } catch (error) {
    record("fail", name, formatError(error));
  }
}

async function checkAdminHealth(cookie: string) {
  try {
    const response = await fetch(`${baseUrl}/api/admin/system/health`, { headers: { cookie } });
    const body = await response.json().catch(() => null);
    const databaseOk = Boolean(body?.services?.database?.ok);
    const queueOk = Boolean(body?.services?.queue?.ok);
    record(
      response.ok && databaseOk && queueOk ? "pass" : "fail",
      "Admin system health",
      `HTTP ${response.status}; database=${databaseOk}; queue=${queueOk}.`,
    );
  } catch (error) {
    record("fail", "Admin system health", formatError(error));
  }
}

function printSummary() {
  const icons: Record<CheckStatus, string> = {
    pass: "PASS",
    warn: "WARN",
    fail: "FAIL",
  };

  for (const check of checks) {
    console.log(`[${icons[check.status]}] ${check.name} - ${check.detail}`);
  }

  const counts = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 } as Record<CheckStatus, number>,
  );

  console.log("");
  console.log(`Summary: ${counts.pass} passed, ${counts.warn} warning(s), ${counts.fail} failed.`);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error.";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
