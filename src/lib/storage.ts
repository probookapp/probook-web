import { AwsClient } from "aws4fetch";

// Uploaded images (company logos, product photos) live in a Cloudflare R2
// bucket served publicly at R2_PUBLIC_URL (files.probookapp.net in production).
//
// That address is our own domain, so what lands there must be inert: only
// raster images are accepted, recognised by their bytes (never by the name or
// type the browser sent), and stored under an extension we choose. An HTML or
// SVG file served from a probookapp.net subdomain would run script on it.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** A rejected upload: the route answers 400 with this message. */
export class InvalidUploadError extends Error {}

type ImageKind = { ext: string; contentType: string };

/** Identify a PNG, JPEG, GIF or WebP by its signature; anything else is null. */
export function detectImage(bytes: Uint8Array): ImageKind | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", contentType: "image/png" };
  if (starts([0xff, 0xd8, 0xff])) return { ext: "jpg", contentType: "image/jpeg" };
  if (starts([0x47, 0x49, 0x46, 0x38])) return { ext: "gif", contentType: "image/gif" };
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error("Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET or R2_PUBLIC_URL");
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

let _client: AwsClient | null = null;

function client(accessKeyId: string, secretAccessKey: string) {
  _client ??= new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  return _client;
}

function objectUrl(accountId: string, bucket: string, key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`;
}

function inlineDriver() {
  // The test environment has no bucket, so the file goes into the row itself
  // as a data: URL — a shape the app already stores and restores (see
  // api/export). Never in production: a database full of images is exactly
  // what the bucket is for.
  return process.env.STORAGE_DRIVER === "inline" && process.env.NODE_ENV !== "production";
}

/**
 * Store an image and return the public URL to save on the row.
 *
 * `baseName` is the name without extension (e.g. "logo", a product id); the
 * extension comes from the detected format. The URL carries a version query
 * so a replaced image is not served stale from Cloudflare's or the browser's
 * cache — the object itself is cached for a year.
 */
export async function uploadImage(
  tenantId: string,
  folder: string,
  baseName: string,
  file: Uint8Array,
): Promise<string> {
  if (file.byteLength === 0) throw new InvalidUploadError("Empty file");
  if (file.byteLength > MAX_UPLOAD_BYTES) {
    throw new InvalidUploadError(`File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);
  }
  const kind = detectImage(file);
  if (!kind) throw new InvalidUploadError("Only PNG, JPEG, GIF and WebP images are accepted");

  if (inlineDriver()) {
    return `data:${kind.contentType};base64,${Buffer.from(file).toString("base64")}`;
  }

  const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = config();
  const key = `${tenantId}/${folder}/${baseName}.${kind.ext}`;
  const res = await client(accessKeyId, secretAccessKey).fetch(objectUrl(accountId, bucket, key), {
    method: "PUT",
    body: new Blob([file as Uint8Array<ArrayBuffer>], { type: kind.contentType }),
    headers: {
      "Content-Type": kind.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);

  return `${publicUrl}/${key}?v=${Date.now()}`;
}

/**
 * Delete the object behind a URL saved by uploadImage. URLs that are not in
 * our bucket (inline data: images, addresses from before the move to R2) are
 * left alone: there is nothing of ours to remove.
 */
export async function deleteStoredImage(storedUrl: string | null | undefined): Promise<void> {
  if (!storedUrl || inlineDriver()) return;
  const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = config();
  if (!storedUrl.startsWith(`${publicUrl}/`)) return;
  const key = decodeURIComponent(storedUrl.slice(publicUrl.length + 1).split("?")[0]);
  const res = await client(accessKeyId, secretAccessKey).fetch(objectUrl(accountId, bucket, key), {
    method: "DELETE",
  });
  // 404: already gone, which is what we wanted.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Storage delete failed: ${res.status} ${await res.text()}`);
  }
}

/** True when two stored URLs point at the same object (versions aside). */
export function sameStoredObject(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.split("?")[0] === b.split("?")[0];
}
