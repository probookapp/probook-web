import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  detectImage,
  uploadImage,
  deleteStoredImage,
  sameStoredObject,
  InvalidUploadError,
  MAX_UPLOAD_BYTES,
} from "../storage";

// 1×1 transparent PNG.
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  )
);
const text = (s: string) => new TextEncoder().encode(s);

describe("detectImage", () => {
  it("recognises the four accepted formats by their bytes", () => {
    expect(detectImage(PNG)).toEqual({ ext: "png", contentType: "image/png" });
    expect(detectImage(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe("jpg");
    expect(detectImage(text("GIF89a"))?.ext).toBe("gif");
    expect(detectImage(text("RIFF\0\0\0\0WEBPVP8 "))?.ext).toBe("webp");
  });

  it("refuses what would run on our domain, whatever it is called", () => {
    expect(detectImage(text("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectImage(text('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(detectImage(text("RIFF\0\0\0\0WAVEfmt "))).toBeNull();
  });
});

describe("uploadImage (inline driver)", () => {
  beforeEach(() => vi.stubEnv("STORAGE_DRIVER", "inline"));
  afterEach(() => vi.unstubAllEnvs());

  it("stores a real image as a data: URL typed from its bytes", async () => {
    const url = await uploadImage("t1", "logos", "logo", PNG);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("rejects non-images, empty files and files over the limit", async () => {
    await expect(uploadImage("t1", "logos", "logo", text("<html>"))).rejects.toBeInstanceOf(InvalidUploadError);
    await expect(uploadImage("t1", "logos", "logo", new Uint8Array())).rejects.toBeInstanceOf(InvalidUploadError);
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(PNG);
    await expect(uploadImage("t1", "logos", "logo", big)).rejects.toBeInstanceOf(InvalidUploadError);
  });

  it("has nothing to delete for inline images", async () => {
    await expect(deleteStoredImage("data:image/png;base64,AAAA")).resolves.toBeUndefined();
  });
});

describe("sameStoredObject", () => {
  const a = "https://files.example.test/t1/logos/logo.png";
  it("ignores the version query", () => {
    expect(sameStoredObject(`${a}?v=1`, `${a}?v=2`)).toBe(true);
  });
  it("tells a format change apart", () => {
    expect(sameStoredObject(`${a}?v=1`, a.replace(".png", ".jpg"))).toBe(false);
  });
  it("treats a missing URL as different", () => {
    expect(sameStoredObject(null, a)).toBe(false);
  });
});
