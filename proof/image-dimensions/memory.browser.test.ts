import { expect, it } from "vitest";
import { resizeChatAttachmentImage } from "./chat-attachment-image.ts";

it("measures near-cap 64MP JPEG decode and resize under serialized owner", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 8000;
  canvas.height = 8000;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("missing fixture context");
  context.fillStyle = "#2468ac";
  context.fillRect(0, 0, 8000, 8000);
  const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/jpeg", 0.9); });
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("missing JPEG");
  const source = new File([blob], "synthetic-64mp.jpg", { type: "image/jpeg" });
  const original = new Uint8Array(await source.arrayBuffer());
  const output = await resizeChatAttachmentImage(source, 6 * 1024 * 1024, new AbortController().signal, () => {});
  expect(output.size).toBeLessThanOrEqual(6 * 1024 * 1024);
  expect(new Uint8Array(await source.arrayBuffer())).toEqual(original);
  const decoded = await createImageBitmap(output);
  try {
    expect([decoded.width, decoded.height]).toEqual([4096, 4096]);
    console.log(JSON.stringify({ sourcePixels: 64000000, sourceBytes: source.size, outputBytes: output.size, outputWidth: decoded.width, outputHeight: decoded.height }));
  } finally { decoded.close(); }
}, 60000);
