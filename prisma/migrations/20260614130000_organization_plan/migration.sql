-- CreateEnum
CREATE TYPE "OrganizationPlan" AS ENUM ('free', 'pro', 'scale');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "plan" "OrganizationPlan" NOT NULL DEFAULT 'free',
ADD COLUMN     "plan_renews_at" TIMESTAMP(3);

