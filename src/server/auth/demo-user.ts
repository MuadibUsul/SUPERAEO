import { getPrisma } from "@/server/db";

export const DEMO_USER_EMAIL = "demo@observable-ai.local";

export async function getOrCreateDemoUser() {
  const prisma = getPrisma();

  return prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    create: {
      email: DEMO_USER_EMAIL,
      name: "Demo Analyst",
    },
    update: {},
  });
}
