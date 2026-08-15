import fs from "fs";
import path from "path";

// Small deterministic hash so the same name always gets the same generated
// art (no Math.random() needed, seed output stays stable across reruns).
function hash(seedStr: string): number {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return h;
}

function hslFromHash(h: number, offset: number): string {
  const hue = (h + offset) % 360;
  return `hsl(${hue}, 70%, ${offset === 0 ? 38 : 55}%)`;
}

// Abstract gradient + geometric-shape cover art, generated from the track/
// album name — no external image tools needed, and no two placeholders
// look identical.
function makeCoverSvg(name: string): string {
  const h = hash(name);
  const c1 = hslFromHash(h, 0);
  const c2 = hslFromHash(h, 70);
  const shapes = [
    `<circle cx="${100 + (h % 300)}" cy="${100 + ((h >> 4) % 300)}" r="${90 + (h % 80)}" fill="${c2}" opacity="0.55"/>`,
    `<rect x="${(h >> 2) % 260}" y="${(h >> 6) % 260}" width="${140 + (h % 120)}" height="${140 + (h % 120)}" fill="#000" opacity="0.18" transform="rotate(${h % 45} 256 256)"/>`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="#0b0b0b"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  ${shapes.join("\n  ")}
</svg>`;
}

export function writeCover(dir: string, name: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${name.replace(/\s+/g, "_").toLowerCase()}.svg`;
  fs.writeFileSync(path.join(dir, fileName), makeCoverSvg(name));
  return fileName;
}
