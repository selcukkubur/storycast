import { createRequire } from "node:module";

// Metro resolves `require("*.png")` to an asset module id; node has no loader for
// images, so the pipeline's watermark import would be parsed as JavaScript.
// `createRequire()` gives the same shared `Module._extensions` table node uses.
const nodeRequire = createRequire(import.meta.url);
const assetStub = (module: { exports: unknown }) => {
  module.exports = 1;
};
for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) nodeRequire.extensions[ext] = assetStub;
