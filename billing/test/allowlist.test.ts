import { describe, expect, it } from "vitest";
import { ALLOWED_APPS } from "../src/proxy";
import pipeline from "../../web/src/lib/studio/pipeline.ts?raw";
import director from "../../web/src/lib/studio/director.ts?raw";
import voices from "../../web/src/lib/studio/voices.ts?raw";
import fal from "../../web/src/lib/studio/fal.ts?raw";

// A fal app id is a lower-case path such as `openai/gpt-image-2.5/flare/text-to-image`
// or the two-segment `openrouter/router`.
const APP_ID = /^[a-z0-9-]+\/[a-z0-9./-]+$/;

const sources: Record<string, string> = { "pipeline.ts": pipeline, "director.ts": director, "voices.ts": voices, "fal.ts": fal };

/**
 * Per-file floor for the extractor, pinned to the counts observed when this test was written
 * (pipeline 23, director 2, voices 1, fal 1). A refactor may add or drop a call, but a file whose
 * extraction silently drops to zero — or mostly to zero — must fail instead of passing vacuously.
 */
const MIN_EXTRACTIONS: Record<string, number> = { "pipeline.ts": 20, "director.ts": 2, "voices.ts": 1, "fal.ts": 1 };

/** Module-level string constants, so `run(TTS, ...)` can be resolved to the literal it names. */
function constants(src: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*["']([^"']*)["']/g)) {
    if (APP_ID.test(m[2])) found.set(m[1], m[2]);
  }
  return found;
}

/** Every app id passed as the first argument of a real `run(...)` / `run<T>(...)` call. */
function calledApps(src: string): string[] {
  const named = constants(src);
  const apps: string[] = [];
  // Reject method calls (`film.run()`) and longer identifiers (`billingRun()`).
  for (const m of src.matchAll(/(?<![\w.$])run(?:<[^>]*>)?\(\s*([^,()]+)/g)) {
    const arg = m[1].trim();
    const literal = arg.match(/^["'`]([^"'`]+)["'`]$/);
    if (literal) {
      if (APP_ID.test(literal[1])) apps.push(literal[1]);
      continue;
    }
    if (/^[A-Za-z_$][\w$]*$/.test(arg) && named.has(arg)) apps.push(named.get(arg)!);
  }
  return apps;
}

describe("fal allowlist contract", () => {
  const called = Object.entries(sources).flatMap(([, src]) => calledApps(src));

  it("extracts app ids from every client source", () => {
    // Guards the extractor itself: a refactor to a different call shape must not silently empty this test.
    for (const [name, src] of Object.entries(sources)) {
      expect(calledApps(src).length, `${name} yielded too few app ids`).toBeGreaterThanOrEqual(MIN_EXTRACTIONS[name]);
    }
  });

  it.each(Object.entries(sources))("allowlists every app %s calls", (name, src) => {
    const apps = calledApps(src);
    expect(apps.length).toBeGreaterThanOrEqual(MIN_EXTRACTIONS[name]);
    const missing = [...new Set(apps)].filter((app) => !ALLOWED_APPS.has(app));
    expect(missing).toEqual([]);
  });

  it("allows openrouter/router for the director's script step", () => {
    const missing = [...new Set(called)].filter((app) => !ALLOWED_APPS.has(app));
    expect(missing).toEqual([]);
    expect(ALLOWED_APPS.has("openrouter/router")).toBe(true);
  });
});
