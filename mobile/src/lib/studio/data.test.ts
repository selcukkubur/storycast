import { describe, expect, it } from "vitest";
import { studioData } from "./data";

describe("studioData", () => {
  it("loads the full bundled catalog", async () => {
    const data = await studioData();
    expect(data.characters).toHaveLength(50);
    expect(data.styles).toHaveLength(26);
    expect(data.languages).toHaveLength(74);
    expect(data.max_minutes).toBe(10);
    expect(Object.keys(data.curated_voices).length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.cameras)).toBe(true);
    expect(data.cameras.length).toBeGreaterThan(0);
    for (const camera of data.cameras) expect(typeof camera).toBe("string");
  });

  it("every cast narrator the app shows has remote sheet and hero art", async () => {
    const data = await studioData();
    for (const id of ["pip", "mo", "lulu", "hazel", "otto", "rose"]) {
      const cast = data.characters.find((c) => c.id === id);
      expect(cast, id).toBeTruthy();
      expect(cast!.sheet).toMatch(/^https:\/\//);
      expect(cast!.hero).toMatch(/^https:\/\//);
      expect(cast!.voice.voice_id.length).toBeGreaterThan(8);
    }
  });

  it("styles expose the anchor and motion strings the director needs", async () => {
    const data = await studioData();
    const style = data.styles.find((s) => s.id === "stick-figure");
    expect(style?.anchor.length).toBeGreaterThan(20);
    expect(style?.motion.length).toBeGreaterThan(5);
    expect(style?.ref).toMatch(/^https:\/\//);
  });
});
