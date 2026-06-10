import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

// Cloudflare R2 = S3 호환. egress 무료라 미디어는 여기로 직결 업/다운로드.
// 서버는 presigned URL만 발급하고 파일 바이트는 거치지 않는다 (서버 부하 0).
const s3 = new S3Client({
  region: "auto",
  endpoint: env.r2.endpoint,
  credentials: { accessKeyId: env.r2.accessKeyId, secretAccessKey: env.r2.secretAccessKey },
});

export async function putObjectBytes(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: env.r2.bucket, Key: key, Body: body, ContentType: contentType })
  );
}

export async function presignPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.r2.bucket, Key: key, ContentType: contentType }),
    { expiresIn: 600 }
  );
}

export async function presignGet(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }), { expiresIn: 600 });
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error("R2 object empty");
  return Buffer.from(bytes);
}
