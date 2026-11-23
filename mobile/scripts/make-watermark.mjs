import { createRequire } from "node:module";

const require = createRequire(new URL("../../billing/package.json", import.meta.url));
const sharp = require("sharp");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1344" height="768">
  <rect width="1344" height="768" fill="#131A4E"/>
  <circle cx="672" cy="300" r="110" fill="none" stroke="#FFB627" stroke-width="6"/>
  <text x="672" y="318" font-family="Georgia, serif" font-size="64" fill="#FFB627" text-anchor="middle">SC</text>
  <text x="672" y="500" font-family="Georgia, serif" font-size="54" fill="#FFF9F0" text-anchor="middle">Made with Storycast</text>
  <text x="672" y="560" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#FFF9F0" opacity="0.7" text-anchor="middle">type a topic, get a story</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(new URL("../assets/brand/watermark.png", import.meta.url).pathname);
console.log("watermark written");
