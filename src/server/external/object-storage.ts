import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { getPrisma } from "@/server/db";

let s3Client: S3Client | null = null;

export function isObjectStorageConfigured() {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET,
  );
}

export function getObjectStorageClient() {
  if (!isObjectStorageConfigured()) {
    throw new Error("S3-compatible object storage is not configured.");
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  return s3Client;
}

export async function storeObjectArtifact(input: {
  projectId?: string;
  artifactType: "ai_response" | "crawl_snapshot" | "analysis_artifact" | "report_export";
  objectKey: string;
  body: string;
  contentType: string;
  metadata?: Record<string, string>;
}) {
  const bucket = process.env.S3_BUCKET;

  if (!bucket || !isObjectStorageConfigured()) {
    return null;
  }

  await getObjectStorageClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: input.metadata,
    }),
  );

  return getPrisma().objectArtifact.create({
    data: {
      projectId: input.projectId,
      artifactType: input.artifactType,
      bucket,
      objectKey: input.objectKey,
      contentType: input.contentType,
      byteSize: Buffer.byteLength(input.body),
      metadata: input.metadata,
    },
  });
}

