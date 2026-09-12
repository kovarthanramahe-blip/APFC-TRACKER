import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('public/icons', { recursive: true });

const svg = 'scripts/icon.svg';

const sizes = [
  { file: 'public/icons/icon-192.png', size: 192 },
  { file: 'public/icons/icon-512.png', size: 512 },
  { file: 'public/apple-touch-icon.png', size: 180 },
];

for (const { file, size } of sizes) {
  await sharp(svg).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}

// Maskable icons need safe-zone padding (icon content within ~80% center)
async function maskable(size, outFile) {
  const inner = Math.round(size * 0.7);
  const icon = await sharp(svg).resize(inner, inner).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 11, g: 18, b: 48, alpha: 1 },
    },
  })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(outFile);
  console.log('wrote', outFile);
}

await maskable(192, 'public/icons/icon-maskable-192.png');
await maskable(512, 'public/icons/icon-maskable-512.png');
