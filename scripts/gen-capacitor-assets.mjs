import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('assets', { recursive: true });

const svg = 'scripts/icon.svg';

// Full icon (navy bg + gold emblem) at 1024x1024 for app icon / legacy launcher icon
await sharp(svg).resize(1024, 1024).png().toFile('assets/icon.png');

// Adaptive icon background: solid navy gradient fill only (no emblem)
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 11, g: 18, b: 48, alpha: 1 } },
})
  .png()
  .toFile('assets/icon-background.png');

// Adaptive icon foreground: just the emblem, transparent bg, sized to fit Android's safe zone (~66%)
const inner = await sharp(svg).resize(680, 680).png().toBuffer();
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile('assets/icon-foreground.png');

// Splash screen: navy background, logo centered
const splashInner = await sharp(svg).resize(600, 600).png().toBuffer();
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: { r: 7, g: 11, b: 22, alpha: 1 } },
})
  .composite([{ input: splashInner, gravity: 'center' }])
  .png()
  .toFile('assets/splash.png');

console.log('Capacitor source assets generated in ./assets');
