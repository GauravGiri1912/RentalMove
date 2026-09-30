import { describe, it, expect } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { sha256Bytes, toHex } from "../src/lib/sha256";

const node = (b: Uint8Array) => crypto.createHash("sha256").update(b).digest("hex");

describe("JS SHA-256 fallback (for phones on http:// without Web Crypto)", () => {
  it("matches the standard test vectors", () => {
    expect(toHex(sha256Bytes(new Uint8Array()))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(toHex(sha256Bytes(new TextEncoder().encode("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("matches Node's crypto at every padding boundary and on random data", () => {
    for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const b = crypto.randomBytes(n);
      expect(toHex(sha256Bytes(b))).toBe(node(b));
    }
  });
  it("matches Node's crypto on a real photo", () => {
    const img = fs.readFileSync(path.join(process.cwd(), "seed/images/2024/bathroom/shower-tile-01.jpg"));
    expect(toHex(sha256Bytes(new Uint8Array(img)))).toBe(node(img));
  });
});
