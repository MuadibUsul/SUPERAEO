import { CreateBucketCommand, DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

import { getPrisma } from "@/server/db";

let s3Client: S3Client | null = null;
let bucketReady: Promise<void> | null = null;

export function isObjectStorageConfigured() {
  return Boolean(
    storageEnv().endpoint && storageEnv().accessKeyId && storageEnv().secretAccessKey && storageEnv().bucket,
  );
}

function storageEnv() {
  return {
    endpoint: process.env.S3_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT,
    region: process.env.S3_REGION || process.env.OBJECT_STORAGE_REGION || "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    bucket: process.env.S3_BUCKET || process.env.OBJECT_STORAGE_BUCKET,
  };
}

export function getObjectStorageClient() {
  if (!isObjectStorageConfigured()) {
    throw new Error("S3-compatible object storage is not configured.");
  }

  if (!s3Client) {
    const config = storageEnv();
    s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId!,
        secretAccessKey: config.secretAccessKey!,
      },
    });
  }

  return s3Client;
}

export function ensureObjectStorageBucket() {
  if (!isObjectStorageConfigured()) {
    throw new Error("S3-compatible object storage is not configured.");
  }
  if (!bucketReady) {
    bucketReady = (async () => {
      const client = getObjectStorageClient();
      const bucket = storageEnv().bucket!;
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 404) throw error;
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    })().catch((error) => {
      bucketReady = null;
      throw error;
    });
  }
  return bucketReady;
}

export async function storeObjectArtifact(input: {
  projectId?: string;
  artifactType: "ai_response" | "crawl_snapshot" | "analysis_artifact" | "report_export";
  objectKey: string;
  body: string;
  contentType: string;
  metadata?: Record<string, string>;
}) {
  const bucket = storageEnv().bucket;

  if (!bucket || !isObjectStorageConfigured()) {
    return null;
  }

  await ensureObjectStorageBucket();

  const checksum = createHash("sha256").update(input.body).digest("hex");
  await getObjectStorageClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: { ...input.metadata, sha256: checksum },
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
      checksum,
      metadata: input.metadata,
    },
  });
}

export async function deleteStoredObject(bucket: string | null, objectKey: string) {
  if (!bucket || !isObjectStorageConfigured()) return false;
  await getObjectStorageClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  return true;
}
