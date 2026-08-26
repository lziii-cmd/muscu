/**
 * Génère les icônes PNG de la PWA.
 *
 *   npx tsx scripts/make-icons.ts
 *
 * Encodeur PNG minimal écrit ici plutôt que d'ajouter une dépendance graphique
 * (sharp, canvas) qui demanderait une compilation native pour trois fichiers
 * produits une seule fois. Le motif est un haltère, dessiné en géométrie simple.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [11, 14, 19] as const; // --bg
const ACCENT = [56, 189, 248] as const; // --accent
const LIGHT = [232, 237, 243] as const; // --text

function crc32(buffer: Buffer): number {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    crc32.table = table;
  }
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}
crc32.table = undefined as Int32Array | undefined;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profondeur 8 bits
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  // Chaque ligne est préfixée de son octet de filtre (0 = aucun).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.subarray(y * size * 4, (y + 1) * size * 4).forEach((value, i) => {
      raw[rowStart + 1 + i] = value;
    });
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Dessine l'icône : fond, pastille d'accent, haltère clair. */
function draw(size: number, maskable: boolean): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const set = (x: number, y: number, rgb: readonly [number, number, number]) => {
    const i = (y * size + x) * 4;
    pixels[i] = rgb[0];
    pixels[i + 1] = rgb[1];
    pixels[i + 2] = rgb[2];
    pixels[i + 3] = 255;
  };

  // Une icône maskable peut être rognée jusqu'à 20 % de chaque côté :
  // le motif reste dans la zone sûre centrale.
  const scale = maskable ? 0.62 : 0.8;
  const radius = size * (maskable ? 0.5 : 0.22);
  const center = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color: readonly [number, number, number] = BG;

      if (maskable) {
        color = BG;
      } else {
        // Coin arrondi
        const dx = Math.max(radius - x, x - (size - 1 - radius), 0);
        const dy = Math.max(radius - y, y - (size - 1 - radius), 0);
        color = Math.hypot(dx, dy) <= radius ? BG : BG;
      }
      set(x, y, color);
    }
  }

  // Haltère : barre centrale + deux disques de chaque côté.
  const barHalfHeight = size * 0.045 * (scale / 0.8);
  const barHalfWidth = size * 0.3 * (scale / 0.8);
  const plateHalfHeight = size * 0.16 * (scale / 0.8);
  const plateHalfWidth = size * 0.055 * (scale / 0.8);
  const outerHalfHeight = size * 0.105 * (scale / 0.8);
  const outerOffset = size * 0.3 * (scale / 0.8);
  const plateOffset = size * 0.2 * (scale / 0.8);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;

      const inBar = Math.abs(dx) <= barHalfWidth && Math.abs(dy) <= barHalfHeight;
      const inPlate =
        Math.abs(Math.abs(dx) - plateOffset) <= plateHalfWidth && Math.abs(dy) <= plateHalfHeight;
      const inOuter =
        Math.abs(Math.abs(dx) - outerOffset) <= plateHalfWidth * 0.75 &&
        Math.abs(dy) <= outerHalfHeight;

      if (inPlate || inOuter) set(x, y, ACCENT);
      else if (inBar) set(x, y, LIGHT);
    }
  }

  return pixels;
}

mkdirSync("public/icons", { recursive: true });

const outputs: [string, number, boolean][] = [
  ["public/icons/icon-192.png", 192, false],
  ["public/icons/icon-512.png", 512, false],
  ["public/icons/icon-maskable-512.png", 512, true],
  ["public/icons/apple-touch-icon.png", 180, false],
];

for (const [path, size, maskable] of outputs) {
  writeFileSync(path, encodePng(size, draw(size, maskable)));
  console.log(`  écrit ${path} (${size}×${size}${maskable ? ", maskable" : ""})`);
}

console.log("✓ Icônes générées.");
