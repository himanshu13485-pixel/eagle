import { Injectable } from "@nestjs/common";
import { mkdir, writeFile, unlink, stat } from "fs/promises";
import { dirname, join } from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Screenshot storage with two drivers:
 *  - STORAGE_DRIVER=local (default): filesystem under STORAGE_DIR, served at /api/files/<key>. Zero-infra dev.
 *  - STORAGE_DRIVER=s3: any S3-compatible bucket (MinIO/AWS/Spaces) with presigned GET URLs. Production.
 */
@Injectable()
export class StorageService {
  private readonly driver = process.env.STORAGE_DRIVER || "local";
  private readonly dir = process.env.STORAGE_DIR || join(process.cwd(), "storage");
  private readonly publicBase =
    process.env.PUBLIC_API_URL || `http://localhost:${process.env.API_PORT || 4000}`;
  private readonly bucket = process.env.S3_BUCKET || "eagle-screenshots";
  private readonly s3 =
    this.driver === "s3"
      ? new S3Client({
          region: process.env.S3_REGION || "us-east-1",
          endpoint: process.env.S3_ENDPOINT,
          forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY || "eagle",
            secretAccessKey: process.env.S3_SECRET_KEY || "eagle-secret",
          },
        })
      : null;

  async putImage(key: string, body: Buffer, contentType = "image/jpeg"): Promise<void> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
      );
      return;
    }
    const full = join(this.dir, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async presignGet(key: string, expiresSec = 3600): Promise<string> {
    if (this.s3) {
      return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: expiresSec,
      });
    }
    return `${this.publicBase}/api/files/${key}`;
  }

  /** Stored size in bytes, or null if the object is gone. Used to backfill
   *  Screenshot.bytes for images written before storage quotas existed. */
  async sizeOf(key: string): Promise<number | null> {
    try {
      if (this.s3) {
        const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return head.ContentLength ?? null;
      }
      return (await stat(join(this.dir, key))).size;
    } catch {
      return null;
    }
  }

  async deleteImage(key: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => {});
      return;
    }
    await unlink(join(this.dir, key)).catch(() => {});
  }
}
