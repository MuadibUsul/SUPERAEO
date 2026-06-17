import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const apiRoot = join(process.cwd(), "src", "app", "api");

function collectRouteFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...collectRouteFiles(path));
      continue;
    }

    if (entry === "route.ts") {
      files.push(path);
    }
  }

  return files;
}

function main() {
  if (!existsSync(apiRoot)) {
    console.error(`API route root not found: ${apiRoot}`);
    process.exit(1);
  }

  const routeFiles = collectRouteFiles(apiRoot);
  const uncovered = routeFiles.filter((file) => {
    const source = readFileSync(file, "utf8");
    return !source.includes("withApiTrace");
  });

  if (uncovered.length > 0) {
    console.error("API routes missing withApiTrace:");
    for (const file of uncovered) {
      console.error(`- ${relative(process.cwd(), file)}`);
    }
    process.exit(1);
  }

  console.log(`API trace coverage passed for ${routeFiles.length} route file(s).`);
}

main();
