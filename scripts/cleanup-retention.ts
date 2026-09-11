import "dotenv/config";
import { cleanupRetention } from "@/server/evidence/retention";
import { getPrisma } from "@/server/db";

cleanupRetention()
  .then((result) => console.log(JSON.stringify(result)))
  .finally(() => getPrisma().$disconnect());
