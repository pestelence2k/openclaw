import { expect, it } from "vitest";
import { resizeChatAttachmentImage } from "./chat-attachment-image.ts";

it("measures bounded 40MP JPEG generation and preparation phases", async () => {
  console.log("MEMORY_PHASE baseline");
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log("MEMORY_PHASE fixture-generation");
  const canvas = document.createElement("canvas");
  canvas.width = 8000;
  canvas.height = 5000;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("missing fixture context");
  context.fillStyle = "#2468ac";
  context.fillRect(0, 0, 8000, 5000);
  const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/jpeg", 0.9); });
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("missing JPEG");
  const source = new File([blob], "synthetic-40mp.jpg", { type: "image/jpeg" });
  const original = new Uint8Array(await source.arrayBuffer());
  console.log("MEMORY_PHASE fixture-retained");
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log("MEMORY_PHASE preparation");
  const output = await resizeChatAttachmentImage(source, 6 * 1024 * 1024, new AbortController().signal, () => {});
  expect(output.size).toBeLessThanOrEqual(6 * 1024 * 1024);
  expect(new Uint8Array(await source.arrayBuffer())).toEqual(original);
  const decoded = await createImageBitmap(output);
  try {
    expect([decoded.width, decoded.height]).toEqual([4096, 2560]);
    console.log(JSON.stringify({ sourcePixels: 40000000, sourceBytes: source.size, outputBytes: output.size, outputWidth: decoded.width, outputHeight: decoded.height }));
  } finally { decoded.close(); }
  console.log("MEMORY_PHASE settled");
  await new Promise((resolve) => setTimeout(resolve, 500));
}, 60000);
