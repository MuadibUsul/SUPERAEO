import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const PLACEHOLDER_DATABASE_MARKERS = [
  "johndoe:randompassword",
  "localhost:5432/mydb",
];

let prisma: PrismaClient | null = null;

export function isDatabaseConfigured() {
  const url = process.env.DATABASE_URL;

  return Boolean(
    url &&
      !PLACEHOLDER_DATABASE_MARKERS.some((marker) => url.includes(marker)),
  );
}

export function getPrisma() {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "DATABASE_URL is not configured. Copy .env.example to .env and set a PostgreSQL connection string.",
    );
  }

  if (!prisma) {
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL!,
      }),
    });
  }

  return prisma;
}

export type DataState<T> =
  | { status: "ready"; data: T }
  | { status: "not-configured"; message: string }
  | { status: "error"; message: string };

export function databaseNotConfiguredState<T>(): DataState<T> {
  return {
    status: "not-configured",
    message:
      "Database is not configured. Set DATABASE_URL, run the Prisma migration, then reload.",
  };
}

export function databaseErrorState<T>(error: unknown): DataState<T> {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "Unexpected database error.",
  };
}
