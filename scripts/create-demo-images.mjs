// Original, explicitly labelled geometric placeholders; no third-party assets.
// Run once after pnpm install. Sharp is already bundled with Next.js.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next"))("sharp");
const frame = (title, drawing) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="660" viewBox="0 0 1000 660"><rect width="1000" height="660" fill="#f0f0f0"/><rect x="0" y="0" width="1000" height="86" fill="#242424"/><text x="36" y="39" font-family="sans-serif" font-size="18" fill="white">SITESCRIBE / FICTIONAL DEMO</text><text x="36" y="68" font-family="sans-serif" font-size="14" fill="#ccc">${title}</text>${drawing}<rect x="0" y="598" width="1000" height="62" fill="#2395ff"/><text x="36" y="636" font-family="sans-serif" font-size="17" fill="black">ILLUSTRATIVE PLACEHOLDER — NOT A SITE PHOTOGRAPH</text></svg>`;
const images = {
  drawing: frame(
    "DEMO S-01 / REVISION A / SITE LOCATION PLAN",
    `<g fill="none" stroke="#777" stroke-width="2"><path d="M110 150H900V535H110Z" stroke-dasharray="12 8"/><path d="M200 210H700V450H200Z" stroke="#242424" stroke-width="8"/><path d="M365 210V450M535 210V450M200 330H700"/><path d="M800 170V505" stroke="#2395ff" stroke-width="18"/><path d="M190 170H700" stroke="#888" stroke-width="12"/></g><g font-family="sans-serif" font-size="18" fill="#242424"><text x="215" y="265">FOUNDATIONS</text><text x="385" y="395">GRID B2</text><text x="745" y="555">EAST DRAIN</text><text x="370" y="145">RETAINING WALL</text><text x="875" y="145">N ↑</text></g>`,
  ),
  foundation: frame(
    "OBS-001 / FOUNDATION REINFORCEMENT",
    `<path d="M110 470L390 180L875 270L580 540Z" fill="#d2d2d2" stroke="#777" stroke-width="5"/><g stroke="#333" stroke-width="8">${Array.from({ length: 8 }, (_, i) => `<path d="M${165 + i * 58} ${475 + i * 5}L${405 + i * 57} ${235 + i * 4}"/>`).join("")}${Array.from({ length: 5 }, (_, i) => `<path d="M${215 + i * 35} ${425 - i * 41}L${715 + i * 31} ${466 - i * 40}"/>`).join("")}</g><text x="60" y="555" font-family="sans-serif" font-size="18" fill="#555">Schematic reinforcement grid · sample evidence only</text>`,
  ),
  drainage: frame(
    "OBS-002 / TEMPORARY SURFACE WATER CHANNEL",
    `<path d="M0 330L450 150L1000 300V590H0Z" fill="#d5d3cf"/><path d="M260 590L590 200L700 235L470 590Z" fill="#888"/><path d="M300 590L610 225L660 240L420 590Z" fill="#2395ff" opacity=".65"/><g stroke="#555" stroke-width="6"><path d="M120 310V460M230 265V405M340 220V350M90 345L385 225"/></g><text x="560" y="505" font-family="sans-serif" font-size="18" fill="#333">East boundary</text>`,
  ),
  retaining: frame(
    "OBS-003 / RETAINING WALL DRAINAGE",
    `<path d="M150 170H840V485H150Z" fill="#c4c4c4" stroke="#777" stroke-width="5"/><g stroke="#999" stroke-width="3"><path d="M150 250H840M150 330H840M150 410H840M300 170V250M600 170V250M450 250V330M750 250V330M300 330V410M600 330V410M450 410V485M750 410V485"/></g><ellipse cx="505" cy="420" rx="34" ry="24" fill="#333"/><path d="M505 438V545" stroke="#2395ff" stroke-width="12"/><text x="590" y="550" font-family="sans-serif" font-size="18" fill="#555">North end · sample outlet</text>`,
  ),
};
mkdirSync("public/demo", { recursive: true });
Promise.all(
  Object.entries(images).map(([name, svg]) =>
    sharp(Buffer.from(svg)).png().toFile(`public/demo/${name}.png`),
  ),
).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
