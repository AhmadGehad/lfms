import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let s3Client: S3Client | null = null;

export function closeStorageBackend() {
  const client = s3Client;
  s3Client = null;
  client?.destroy();
}

function hasS3Configuration() {
  return Boolean(ENV.objectStorageBucket);
}

function getS3Client() {
  if (s3Client) return s3Client;
  validateStorageConfiguration();
  const credentials = ENV.objectStorageAccessKeyId && ENV.objectStorageSecretAccessKey
    ? {
        accessKeyId: ENV.objectStorageAccessKeyId,
        secretAccessKey: ENV.objectStorageSecretAccessKey,
      }
    : undefined;
  s3Client = new S3Client({
    region: ENV.objectStorageRegion,
    endpoint: ENV.objectStorageEndpoint || undefined,
    forcePathStyle: Boolean(ENV.objectStorageEndpoint),
    credentials,
  });
  return s3Client;
}

function validatedUrl(value: string, label: string, options: { allowPrivate?: boolean } = {}) {
  const url = new URL(value);
  if (url.protocol !== "https:" && (!ENV.isProduction && url.protocol !== "http:")) {
    throw new Error(`${label} must use HTTPS${ENV.isProduction ? "" : " or HTTP in development"}`);
  }
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  if (ENV.isProduction && !options.allowPrivate) {
    const host = url.hostname.toLowerCase();
    const privateIpv4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
    if (host === "localhost" || host.endsWith(".local") || privateIpv4.test(host) || host === "::1") {
      throw new Error(`${label} must not target a local or private address`);
    }
  }
  return url;
}

export function validateStorageConfiguration() {
  if (hasS3Configuration()) {
    if (!ENV.objectStorageRegion) {
      throw new Error("OBJECT_STORAGE_REGION is required when OBJECT_STORAGE_BUCKET is set");
    }
    const hasAccessKey = Boolean(ENV.objectStorageAccessKeyId);
    const hasSecretKey = Boolean(ENV.objectStorageSecretAccessKey);
    if (hasAccessKey !== hasSecretKey) {
      throw new Error("Object-storage access key and secret must be configured together");
    }
    if (ENV.objectStorageEndpoint) {
      const endpoint = validatedUrl(ENV.objectStorageEndpoint, "OBJECT_STORAGE_ENDPOINT", { allowPrivate: true });
      if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new Error("OBJECT_STORAGE_ENDPOINT must not contain credentials, query, or fragment");
      }
      // SSE-KMS is an AWS-only feature. Supabase Storage (and other
      // S3-compatible endpoints) reject the header, so every upload would
      // fail at runtime; refuse the combination at startup instead.
      if (ENV.objectStorageKmsKeyId) {
        throw new Error(
          "OBJECT_STORAGE_KMS_KEY_ID is only supported on AWS S3; unset it when OBJECT_STORAGE_ENDPOINT is configured",
        );
      }
    }
    return;
  }
  throw new Error(
    "Private storage is not configured; set OBJECT_STORAGE_BUCKET and OBJECT_STORAGE_REGION",
  );
}

export async function putPrivateObject(input: {
  key: string;
  bytes: Buffer;
  contentType: string;
  checksumSha256: string;
}) {
  if (hasS3Configuration()) {
    await getS3Client().send(new PutObjectCommand({
      Bucket: ENV.objectStorageBucket,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
      Metadata: { "checksum-sha256": input.checksumSha256 },
      ...(ENV.objectStorageKmsKeyId
        ? {
            ServerSideEncryption: "aws:kms" as const,
            SSEKMSKeyId: ENV.objectStorageKmsKeyId,
          }
        : {}),
    }));
    return;
  }

  throw new Error("Storage backend unavailable");
}

export async function getPrivateObjectUrl(key: string) {
  if (hasS3Configuration()) {
    return getSignedUrl(
      getS3Client(),
      new GetObjectCommand({ Bucket: ENV.objectStorageBucket, Key: key }),
      { expiresIn: 300 },
    );
  }
  throw new Error("Storage backend unavailable");
}

async function collectBytes(
  source: AsyncIterable<Uint8Array>,
  maximumBytes: number,
) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of source) {
    const chunk = Buffer.from(value);
    size += chunk.length;
    if (size > maximumBytes) throw new Error("Storage object exceeds restore size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

export async function getPrivateObjectBytes(key: string, maximumBytes: number) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error("Invalid storage download limit");
  }
  if (hasS3Configuration()) {
    const response = await getS3Client().send(new GetObjectCommand({
      Bucket: ENV.objectStorageBucket,
      Key: key,
    }));
    if (response.ContentLength !== undefined && response.ContentLength > maximumBytes) {
      throw new Error("Storage object exceeds restore size limit");
    }
    if (!response.Body || !(Symbol.asyncIterator in response.Body)) {
      throw new Error("Storage object body is unavailable");
    }
    return collectBytes(response.Body as AsyncIterable<Uint8Array>, maximumBytes);
  }

  throw new Error("Storage backend unavailable");
}
