import { describe, it, expect } from "vitest";
import { exifFromMetadata, parseExifDate, photoTimeCheck } from "../src/lib/phototime";

describe("photo-time check", () => {
  it("parses EXIF dates and keeps only time, software and camera", () => {
    expect(parseExifDate("2026:06:01 10:12:00")).toBe("2026-06-01T10:12:00");
    expect(parseExifDate("2026:06:01 10:12:00", "+05:30")).toBe("2026-06-01T10:12:00+05:30");
    expect(parseExifDate("0000:00:00 00:00:00")).toBeNull();
    expect(parseExifDate("garbage")).toBeNull();
    const e = exifFromMetadata({ DateTimeOriginal: "2024:05:20 09:00:00", Make: "Apple", Model: "iPhone 13", GPSLatitude: "28 deg 36' 50.00\" N" });
    expect(e).toEqual({ taken_at: "2024-05-20T09:00:00", software: null, camera: "Apple iPhone 13" });
    expect(JSON.stringify(e)).not.toMatch(/GPS|deg/);
  });

  it("flags photos taken well before the visit, clock errors and editing software", () => {
    const visit = "2026-06-01T09:00:00Z";
    expect(photoTimeCheck({ taken_at: "2026-06-01T10:12:00", software: null, camera: null }, visit, "2026-06-01T12:00:00Z").level).toBe("ok");
    expect(photoTimeCheck({ taken_at: "2026-05-30T18:00:00", software: null, camera: null }, visit, null).level).toBe("ok"); // within tolerance
    const old = photoTimeCheck({ taken_at: "2024-05-20T09:00:00", software: null, camera: null }, visit, null);
    expect(old.level).toBe("warn");
    expect(old.label).toBe("Taken 24 months before this visit");
    expect(photoTimeCheck({ taken_at: "2026-06-05T09:00:00", software: null, camera: null }, visit, "2026-06-01T12:00:00Z").label).toMatch(/after the upload/);
    // Filed under a June visit but taken in September (the real phone test).
    const late = photoTimeCheck({ taken_at: "2026-09-30T18:05:34", software: null, camera: null }, visit, "2026-09-30T12:35:00Z");
    expect(late.level).toBe("warn");
    expect(late.label).toBe("Taken 4 months after this visit");
    expect(photoTimeCheck({ taken_at: "2026-06-03T09:00:00", software: null, camera: null }, visit, null).level).toBe("ok"); // within 3 days
    expect(photoTimeCheck({ taken_at: "2026-06-01T10:00:00", software: "Adobe Photoshop 25.0", camera: null }, visit, null).label).toMatch(/Edited with Adobe Photoshop/);
    expect(photoTimeCheck({ taken_at: null, software: "Android 14", camera: null }, visit, null).level).toBe("none");
    expect(photoTimeCheck(null, visit, null).label).toBe("No capture time in file");
  });
});
