const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const env = require("../config/env");

// Private S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, Backblaze...).
// Objects are never public. Downloads use short-lived presigned URLs.
function createS3Driver() {
  const client = new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY },
  });
  const Bucket = env.STORAGE_BUCKET;

  return {
    name: "s3",
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" })
      );
    },
    async get(key) {
      const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return Buffer.from(await out.Body.transformToByteArray());
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async signedUrl(key, { fileName, contentType }) {
      const cmd = new GetObjectCommand({
        Bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\\r\n]/g, "_")}"`,
      });
      return getSignedUrl(client, cmd, { expiresIn: env.SIGNED_URL_TTL_SECONDS });
    },
  };
}

module.exports = { createS3Driver };
