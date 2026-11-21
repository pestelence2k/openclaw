// Hosted tooling only; installed over the existing media fixture after product accounting.
// Real Gateway and real UI; fixed-response mock provider, never a live paid model.
import { createHash } from "node:crypto";
import path from "node:path";
import { expect, it } from "vitest";
import { createControlUiE2eSuite } from "../../../ui/src/e2e/control-ui-e2e-suite.test-support.ts";
import { waitForControlUiGatewayReady } from "../../../ui/src/test-helpers/control-ui-e2e-readiness.ts";
import { navigateToControlUiSession } from "../../../ui/src/test-helpers/control-ui-e2e.ts";
import { authenticateControlUi, startControlUiGateway, stopControlUiGateway } from "./control-ui-gateway.e2e.test-support.ts";
import { createQaLiveLaneGateway } from "./live-transports/shared/live-gateway.runtime.ts";

const baseline = process.env.IMAGE_PROOF_BASELINE === "1";
const owner = createQaLiveLaneGateway();
let gateway: Awaited<ReturnType<typeof startControlUiGateway>>;
let proofDir: string;
const suite = createControlUiE2eSuite({
  name: "Image dimensions real Gateway mocked-provider boundary",
  startServerBeforeBrowser: true,
  setupTimeoutMs: 240000,
  resources: {
    retainedState: () => gateway?.gateway.tempRoot,
    run: async () => {
      proofDir = suite.artifactDir;
      gateway = await startControlUiGateway(owner, suite.server.baseUrl, {
        command: { executablePath: process.execPath, argsPrefix: [path.join(process.cwd(), "openclaw.mjs")], cwd: process.cwd(), usePackagedPlugins: false },
        mutateConfig: (cfg) => {
          const model = cfg.models?.providers?.["mock-openai"]?.models.find((entry) => entry.id === "gpt-5.6-luna");
          if (!model) throw new Error("mock model missing");
          model.input = ["text", "image"];
          return cfg;
        },
      });
    },
    close: () => stopControlUiGateway(owner, proofDir, "image proof cleanup failed"),
  },
});

function imageUrls(value: unknown): string[] {
  if (typeof value === "string") return value.startsWith("data:image/") ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(imageUrls);
  if (value && typeof value === "object") return Object.values(value).flatMap(imageUrls);
  return [];
}

suite.define(() => {
  it("delivers picker, data-url paste and file drop through real Gateway to mock provider", { timeout: 240000 }, async () => {
    await suite.withPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", locale: "en-US" }, async ({ page }) => {
      await authenticateControlUi(page, gateway.gateway);
      for (const route of baseline ? ["picker"] as const : ["picker", "paste", "drop"] as const) {
        const sessionKey = "agent:qa:image-proof-" + route;
        console.log("IMAGE_PHASE " + route + " session-create");
        await gateway.gateway.call("sessions.create", { key: sessionKey, agentId: "qa", label: "Image proof " + route });
        await page.goto(new URL("chat", suite.server.baseUrl).href);
        await waitForControlUiGatewayReady(page);
        await navigateToControlUiSession(page, sessionKey);
        const composer = page.getByRole("textbox", { name: "Chat composer", exact: true });
        await composer.waitFor({ state: "visible" });
        await expect.poll(() => composer.isEnabled()).toBe(true);
        console.log("IMAGE_PHASE " + route + " ready");
        const dataUrl = await page.evaluate(async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 8160; canvas.height = 4590;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("fixture canvas unavailable");
          ctx.fillStyle = "#2468ac"; ctx.fillRect(0, 0, 8160, 4590);
          const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/jpeg", 0.9); });
          canvas.width = canvas.height = 0;
          if (!blob) throw new Error("fixture encoding failed");
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        });
        const original = Buffer.from(dataUrl.split(",")[1], "base64");
        const originalSha = createHash("sha256").update(original).digest("hex");
        console.log("IMAGE_FIXTURE " + JSON.stringify({ route, baseline, width: 8160, height: 4590, bytes: original.length, sha256: originalSha, recipe: "Chromium canvas solid #2468ac; JPEG quality 0.9" }));
        expect(original.length).toBeLessThan(6 * 1024 * 1024);
        await composer.fill("Reply exactly `IMAGE_PROOF_" + route.toUpperCase() + "_OK`");
        if (route === "picker") {
          await page.locator(".agent-chat__file-input").setInputFiles({ name: "synthetic.jpg", mimeType: "image/jpeg", buffer: original });
        } else {
          await composer.evaluate(async (element, params) => {
            const transfer = new DataTransfer();
            if (params.route === "paste") {
              transfer.setData("text/plain", params.dataUrl);
              element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
            } else {
              transfer.items.add(new File([await (await fetch(params.dataUrl)).blob()], "synthetic.jpg", { type: "image/jpeg" }));
              element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
            }
          }, { route, dataUrl });
        }
        const filename = route === "paste" ? "pasted-image.jpeg" : "synthetic.jpg";
        await page.getByRole("img", { name: filename }).waitFor();
        console.log("IMAGE_PHASE " + route + " prepared");
        await page.getByRole("button", { name: "Send message" }).click();
        const userImage = page.locator(".chat-group.user img.chat-message-image");
        await expect.poll(() => userImage.first().evaluate((image) => image instanceof HTMLImageElement && image.complete ? image.naturalWidth : 0), { timeout: 30000 }).toBe(baseline ? 8160 : 4096);
        if (!gateway.mock) throw new Error("mock provider unavailable");
        const mockUrl = gateway.mock.baseUrl;
        const finalReply = "IMAGE_PROOF_" + route.toUpperCase() + "_OK";
        try {
          await page.locator(".chat-group.assistant .chat-text", { hasText: finalReply }).last().waitFor({ timeout: 90000 });
        } catch (error) {
          const records = await (await fetch(mockUrl + "/debug/requests")).json() as Array<{ model: string; imageInputCount: number; allInputText: string }>;
          console.log("IMAGE_PROVIDER_DIAGNOSTIC " + JSON.stringify({ baseline, route, requests: records.map((record) => ({ model: record.model, imageInputs: record.imageInputCount, markerMatched: record.allInputText.includes(finalReply) })) }));
          throw error;
        }
        console.log("IMAGE_PHASE " + route + " assistant-reply");
        const readCaptured = async () => {
          const requests = await (await fetch(mockUrl + "/debug/requests")).json() as Array<{ allInputText: string; imageInputCount: number; body: unknown }>;
          return requests.filter((request) => request.allInputText.includes(finalReply));
        };
        await expect.poll(async () => (await readCaptured()).length, { timeout: 15000 }).toBe(1);
        const captured = await readCaptured();
        console.log("IMAGE_PROVIDER " + JSON.stringify({ baseline, route, matchingRequests: captured.length, imageInputs: captured.map((request) => request.imageInputCount) }));
        expect(captured).toHaveLength(1);
        expect(captured[0].imageInputCount).toBe(1);
        const urls = imageUrls(captured[0].body);
        expect(urls).toHaveLength(1);
        const pixels = await page.evaluate(async (url) => {
          const blob = await (await fetch(url)).blob();
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("pixel context unavailable");
          ctx.drawImage(bitmap, 0, 0, 1, 1);
          const result = { width: bitmap.width, height: bitmap.height, bytes: blob.size, color: Array.from(ctx.getImageData(0, 0, 1, 1).data) };
          bitmap.close();
          return result;
        }, urls[0]);
        expect(pixels.width).toBeGreaterThan(0);
        expect(Math.max(pixels.width, pixels.height)).toBeLessThanOrEqual(4096);
        expect(pixels.width / pixels.height).toBeCloseTo(8160 / 4590, 2);
        expect(pixels.bytes).toBeLessThanOrEqual(6 * 1024 * 1024);
        for (const [index, expected] of [36, 104, 172].entries()) expect(Math.abs(pixels.color[index] - expected)).toBeLessThan(6);
        expect(createHash("sha256").update(original).digest("hex")).toBe(originalSha);
        console.log("IMAGE_BOUNDARY " + JSON.stringify({ route, originalSha, originalBytes: original.length, preparedWidth: baseline ? 8160 : 4096, provider: pixels, imageInputs: 1, finalReply, mockedProvider: true }));
      }
    });
  });
});
