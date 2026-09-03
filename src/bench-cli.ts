import { simulate, type SimResult } from "./bench";

const TOTAL = 2000;
const FRAMES = 300;

function pad(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function row(label: string, r: SimResult, extra = ""): string {
  return (
    "  " +
    label.padEnd(9) +
    "→ " +
    pad(r.regionsPerFrame.toFixed(1), 5) +
    " bölge  " +
    pad("%" + (r.dirtyRatio * 100).toFixed(1), 6) +
    " kirli  " +
    pad(r.drawnPerFrame.toFixed(1), 6) +
    " çizim" +
    extra
  );
}

console.log(
  `birleştirme kuralı (${TOTAL} nesne, 40 hareketli, ${FRAMES} kare, 640x360)`,
);
console.log(
  row(
    "yok",
    simulate(TOTAL, 40, { maxWaste: 0, maxRegions: 1000, frames: FRAMES }),
  ),
);
console.log(
  row(
    "oran 1.5",
    simulate(TOTAL, 40, {
      strategy: "ratio",
      maxRegions: 1000,
      frames: FRAMES,
    }),
  ),
);

console.log("");
console.log(
  `maxWaste sweep (${TOTAL} nesne, 40 hareketli, ${FRAMES} kare, 640x360)`,
);
for (const w of [0, 500, 2000, 8000, 32000, Infinity]) {
  // maxRegions tavanı devre dışı: maxWaste'in saf etkisi ölçülsün.
  const r = simulate(TOTAL, 40, {
    maxWaste: w,
    maxRegions: 1000,
    frames: FRAMES,
  });
  console.log(row(String(w), r));
}

console.log("");
console.log(`moving sweep (maxWaste 2000, maxRegions 24, ${FRAMES} kare)`);
for (const m of [5, 20, 40, 100, 200, 400, 2000]) {
  const r = simulate(TOTAL, m, { maxWaste: 2000, frames: FRAMES });
  const ratio = ((r.drawnPerFrame / TOTAL) * 100).toFixed(0);
  const label = `${m} (%${((m / TOTAL) * 100).toFixed(2).replace(/\.?0+$/, "")})`;
  console.log(
    row(
      label,
      r,
      `  tam çizime göre %${ratio}  takip ${r.overheadMsPerFrame.toFixed(3)} ms/kare`,
    ),
  );
}
