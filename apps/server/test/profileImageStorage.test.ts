import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { validateAndNormalizeProfileImage } from "../src/profileImageStorage.js";

function upload(buffer: Buffer, originalname = "portrait.png", mimetype = "image/png"): Express.Multer.File {
  return {
    fieldname: "image",
    originalname,
    encoding: "7bit",
    mimetype,
    size: buffer.length,
    destination: "",
    filename: "",
    path: "",
    buffer,
    stream: undefined as never
  };
}

test("profile photos are decoded, cropped, resized, and converted to WebP", async () => {
  const source = await sharp({ create: { width: 640, height: 320, channels: 3, background: "#32c995" } }).png().toBuffer();
  const normalized = await validateAndNormalizeProfileImage(upload(source));
  const metadata = await sharp(normalized.buffer).metadata();

  assert.equal(normalized.width, 512);
  assert.equal(normalized.height, 512);
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.equal(metadata.format, "webp");
});

test("profile image validation rejects undersized and disguised files", async () => {
  const tiny = await sharp({ create: { width: 128, height: 128, channels: 3, background: "#111111" } }).png().toBuffer();
  await assert.rejects(validateAndNormalizeProfileImage(upload(tiny)), /at least 256/i);
  await assert.rejects(validateAndNormalizeProfileImage(upload(tiny, "payload.exe", "image/png")), /JPG, JPEG, PNG, or WebP/i);
  await assert.rejects(validateAndNormalizeProfileImage(upload(Buffer.from("not-an-image"))), /valid image/i);
});
