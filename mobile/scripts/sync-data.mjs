import { copyFileSync, mkdirSync } from "node:fs";

const src = new URL("../../web/public/data/", import.meta.url);
const dst = new URL("../assets/data/", import.meta.url);
mkdirSync(dst, { recursive: true });
for (const name of ["config.json", "films.json"]) copyFileSync(new URL(name, src), new URL(name, dst));
console.log("synced", dst.pathname);
