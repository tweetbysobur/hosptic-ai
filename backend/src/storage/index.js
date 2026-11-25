const path = require("path");
const fs = require("fs/promises");
const { env } = require("../config/env");
const { AppError } = require("../utils/AppError");

/**
 * Private object storage. Keys are always organisation-scoped and validated.
 * Callers never receive public URLs.
 */
const KEY_PATTERN = /^organizations\/[0-9a-f-]{36}\/[A-Za-z0-9/_.-]+$/;

function assertKey(key) {
  if (typeof key !== "string" || !KEY_PATTERN.test(key) || key.includes("..")) {
    throw new AppError(500, "Invalid storage key", "STORAGE_ERROR");
  }
  return key;
}

function datasetKey(organizationId, datasetId, extension) {
  return `organizations/${organizationId}/datasets/${datasetId}/original.${extension}`;
}

function reportKey(organizationId, reportId) {
  return `organizations/${organizationId}/reports/${reportId}.pdf`;
}

class LocalStorage {
  constructor(rootDir) {
    this.root = path.resolve(rootDir);
  }

  resolve(key) {
    const target = path.join(this.root, assertKey(key));
    if (!target.startsWith(this.root + path.sep)) {
      throw new AppError(500, "Invalid storage key", "STORAGE_ERROR");
    }
    return target;
  }

  async put(key, buffer) {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, buffer, { mode: 0o600 });
    return key;
  }

  async get(key) {
    return fs.readFile(this.resolve(key));
  }

  async remove(key) {
    await fs.rm(this.resolve(key), { force: true });
  }

  async signedUrl() {
    throw new AppError(501, "Signed download URLs require S3-compatible storage", "NOT_SUPPORTED");
  }
}

class S3Storage {
  constructor(config = env) {
    const { S3Client } = require("@aws-sdk/client-s3");
    if (!config.STORAGE_BUCKET || !config.STORAGE_ACCESS_KEY || !config.STORAGE_SECRET_KEY) {
      throw new Error("S3 storage needs STORAGE_BUCKET, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY");
    }
    this.bucket = config.STORAGE_BUCKET;
    this.client = new S3Client({
      region: config.STORAGE_REGION,
      endpoint: config.STORAGE_ENDPOINT || undefined,
      forcePathStyle: true,
      // Only send checksums when an operation requires them. Some S3-compatible servers reject the SDK default.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: { accessKeyId: config.STORAGE_ACCESS_KEY, secretAccessKey: config.STORAGE_SECRET_KEY },
    });
  }

  async put(key, buffer, contentType = "application/octet-stream") {
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: assertKey(key),
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      })
    );
    return key;
  }

  async get(key) {
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: assertKey(key) }));
    const chunks = [];
    for await (const chunk of response.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async remove(key) {
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: assertKey(key) }));
  }

  async signedUrl(key, expiresInSeconds = 300) {
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: assertKey(key) }), {
      expiresIn: expiresInSeconds,
    });
  }
}

let instance;

/** Test-only hook. Replaces the storage backend. Pass null to restore the configured one. */
function setStorageForTesting(storage) {
  instance = storage || undefined;
}

function getStorage() {
  if (!instance) {
    instance = env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage(env.STORAGE_LOCAL_DIR);
  }
  return instance;
}

module.exports = { getStorage, setStorageForTesting, datasetKey, reportKey, assertKey, LocalStorage, S3Storage };
