import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { hashPassword } from "../src/server/auth/password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

async function main() {
  const operatorPassword = await hashPassword("Operator@123456");
  const customerPassword = await hashPassword("Customer@123456");

  const operator = await prisma.user.upsert({
    where: { email: "operator@aeo.local" },
    update: {
      passwordHash: operatorPassword,
      role: "platform_owner",
      preferredLocale: "zh-CN",
    },
    create: {
      email: "operator@aeo.local",
      name: "Platform Owner",
      passwordHash: operatorPassword,
      role: "platform_owner",
      preferredLocale: "zh-CN",
    },
  });

  const internalOrg = await prisma.organization.upsert({
    where: { slug: "aeo-operations" },
    update: {},
    create: {
      name: "AEO Operations",
      slug: "aeo-operations",
      type: "internal",
      defaultLocale: "zh-CN",
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: internalOrg.id,
        userId: operator.id,
      },
    },
    update: { role: "platform_owner" },
    create: {
      organizationId: internalOrg.id,
      userId: operator.id,
      role: "platform_owner",
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: "demo@observable-ai.local" },
    update: {
      passwordHash: customerPassword,
      role: "customer_owner",
      preferredLocale: "zh-CN",
    },
    create: {
      email: "demo@observable-ai.local",
      name: "Demo Customer",
      passwordHash: customerPassword,
      role: "customer_owner",
      preferredLocale: "zh-CN",
    },
  });

  const customerOrg = await prisma.organization.upsert({
    where: { slug: "demo-customer" },
    update: {},
    create: {
      name: "Demo Customer",
      slug: "demo-customer",
      type: "customer",
      defaultLocale: "zh-CN",
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: customerOrg.id,
        userId: customer.id,
      },
    },
    update: { role: "customer_owner" },
    create: {
      organizationId: customerOrg.id,
      userId: customer.id,
      role: "customer_owner",
    },
  });

  const demoProject = await prisma.project.upsert({
    where: { id: "demo-project-cip" },
    update: {
      organizationId: customerOrg.id,
      userId: customer.id,
    },
    create: {
      id: "demo-project-cip",
      userId: customer.id,
      organizationId: customerOrg.id,
      name: "Demo CIP Baseline Audit",
      brandName: "Cognition Intelligence Platform",
      domain: "https://example.com",
      industry: "B2B SaaS",
      targetMarket: "English-speaking B2B SaaS marketing and content teams",
      language: "en",
      competitors: {
        create: [
          { name: "Profound", domain: "https://www.tryprofound.com", category: "direct" },
          { name: "Peec AI", domain: "https://peec.ai", category: "direct" },
          { name: "Semrush", domain: "https://www.semrush.com", category: "adjacent" },
        ],
      },
    },
  });

  await prisma.projectSubject.upsert({
    where: {
      projectId_canonicalName_entityType: {
        projectId: demoProject.id,
        canonicalName: "cognition intelligence platform",
        entityType: "BRAND",
      },
    },
    update: {
      displayName: "Cognition Intelligence Platform",
      websiteUrl: "https://example.com",
      market: "English-speaking B2B SaaS marketing and content teams",
      language: "en",
      isPrimary: true,
      profileJson: {
        source: "seed",
        brandName: "Cognition Intelligence Platform",
        domain: "https://example.com",
        industry: "B2B SaaS",
        targetMarket: "English-speaking B2B SaaS marketing and content teams",
      },
    },
    create: {
      projectId: demoProject.id,
      entityType: "BRAND",
      displayName: "Cognition Intelligence Platform",
      canonicalName: "cognition intelligence platform",
      websiteUrl: "https://example.com",
      market: "English-speaking B2B SaaS marketing and content teams",
      language: "en",
      isPrimary: true,
      profileJson: {
        source: "seed",
        brandName: "Cognition Intelligence Platform",
        domain: "https://example.com",
        industry: "B2B SaaS",
        targetMarket: "English-speaking B2B SaaS marketing and content teams",
      },
    },
  });

  const provider = await prisma.aIProvider.upsert({
    where: { id: "default-openai-responses" },
    update: {},
    create: {
      id: "default-openai-responses",
      name: "OpenAI Responses Placeholder",
      providerType: "openai_responses",
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4.1-mini",
      enabled: false,
      supportsJsonSchema: true,
      supportsCitations: false,
      supportsWebSearch: false,
      supportsEmbeddings: true,
      createdById: operator.id,
    },
  });

  await prisma.aIModel.upsert({
    where: {
      providerId_name: {
        providerId: provider.id,
        name: "gpt-4.1-mini",
      },
    },
    update: {},
    create: {
      providerId: provider.id,
      name: "gpt-4.1-mini",
      displayName: "GPT-4.1 mini",
      enabled: true,
      supportsJsonSchema: true,
      supportsEmbeddings: true,
      defaultForTasks: ["json", "sampling"],
    },
  });

  const defaultPolicies = [
    {
      task: "semantic_keyword_generator",
      tier: "mid_tier_verification",
      executionStrategy: "sharded_parallel",
      providerSelection: "priority_spread",
      laneCount: 3,
      minLaneCount: 1,
      maxLaneCount: 3,
      targetLatencySeconds: 60,
      timeoutSeconds: 90,
    },
    {
      task: "query_generator",
      tier: "mid_tier_verification",
      executionStrategy: "adaptive_parallel",
      providerSelection: "priority_spread",
      laneCount: 4,
      minLaneCount: 2,
      maxLaneCount: 4,
      targetLatencySeconds: 120,
      timeoutSeconds: 120,
    },
    {
      task: "answer_sampling",
      tier: "low_cost_sampling",
      executionStrategy: "adaptive_parallel",
      providerSelection: "round_robin",
      laneCount: 6,
      minLaneCount: 2,
      maxLaneCount: 8,
      targetLatencySeconds: 120,
      timeoutSeconds: 120,
    },
    {
      task: "long_tail_scenario_generation",
      tier: "mid_tier_verification",
      executionStrategy: "single_lane",
      providerSelection: "primary_only",
      laneCount: 1,
      minLaneCount: 1,
      maxLaneCount: 2,
      targetLatencySeconds: 90,
      timeoutSeconds: 120,
    },
    {
      task: "question_cluster_generation",
      tier: "mid_tier_verification",
      executionStrategy: "single_lane",
      providerSelection: "primary_only",
      laneCount: 1,
      minLaneCount: 1,
      maxLaneCount: 2,
      targetLatencySeconds: 90,
      timeoutSeconds: 120,
    },
    {
      task: "opportunity_answer_extraction",
      tier: "mid_tier_verification",
      executionStrategy: "adaptive_parallel",
      providerSelection: "priority_spread",
      laneCount: 3,
      minLaneCount: 1,
      maxLaneCount: 4,
      targetLatencySeconds: 120,
      timeoutSeconds: 120,
    },
    {
      task: "semantic_term_extraction",
      tier: "mid_tier_verification",
      executionStrategy: "single_lane",
      providerSelection: "primary_only",
      laneCount: 1,
      minLaneCount: 1,
      maxLaneCount: 2,
      targetLatencySeconds: 60,
      timeoutSeconds: 90,
    },
    {
      task: "semantic_term_classification",
      tier: "mid_tier_verification",
      executionStrategy: "single_lane",
      providerSelection: "primary_only",
      laneCount: 1,
      minLaneCount: 1,
      maxLaneCount: 2,
      targetLatencySeconds: 60,
      timeoutSeconds: 90,
    },
    {
      task: "semantic_nebula_build",
      tier: "mid_tier_verification",
      executionStrategy: "single_lane",
      providerSelection: "primary_only",
      laneCount: 1,
      minLaneCount: 1,
      maxLaneCount: 1,
      targetLatencySeconds: 60,
      timeoutSeconds: 120,
    },
    {
      task: "long_tail_opportunity_generation",
      tier: "mid_tier_verification",
      executionStrategy: "single_lane",
      providerSelection: "primary_only",
      laneCount: 1,
      minLaneCount: 1,
      maxLaneCount: 2,
      targetLatencySeconds: 180,
      timeoutSeconds: 240,
    },
    {
      task: "question_territory_build",
      tier: "mid_tier_verification",
      executionStrategy: "single_lane",
      providerSelection: "primary_only",
      laneCount: 1,
      minLaneCount: 1,
      maxLaneCount: 1,
      targetLatencySeconds: 60,
      timeoutSeconds: 120,
    },
    {
      task: "opportunity_probe_sampling",
      tier: "low_cost_sampling",
      executionStrategy: "adaptive_parallel",
      providerSelection: "round_robin",
      laneCount: 4,
      minLaneCount: 1,
      maxLaneCount: 6,
      targetLatencySeconds: 180,
      timeoutSeconds: 180,
    },
    {
      task: "brand_semantic_probe_sampling",
      tier: "low_cost_sampling",
      executionStrategy: "adaptive_parallel",
      providerSelection: "round_robin",
      laneCount: 24,
      minLaneCount: 15,
      maxLaneCount: 30,
      targetLatencySeconds: 60,
      timeoutSeconds: 120,
    },
  ] as const;

  for (const policy of defaultPolicies) {
    await prisma.taskExecutionPolicy.upsert({
      where: { task: policy.task },
      update: policy,
      create: policy,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
