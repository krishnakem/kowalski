import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { Jimp, ResizeStrategy } from 'jimp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const sourcePng = path.join(projectRoot, 'build', 'icon.png');
const outIcns = path.join(projectRoot, 'build', 'icon.icns');
const iconsetDir = path.join(projectRoot, 'build', '.icon.iconset');

// Apple's full iconset spec — every slot macOS may ask for.
const slots = [
    { name: 'icon_16x16.png',      size: 16 },
    { name: 'icon_16x16@2x.png',   size: 32 },
    { name: 'icon_32x32.png',      size: 32 },
    { name: 'icon_32x32@2x.png',   size: 64 },
    { name: 'icon_128x128.png',    size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png',    size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png',    size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
];

if (!fs.existsSync(sourcePng)) {
    console.error(`❌ Source PNG not found: ${sourcePng}`);
    process.exit(1);
}

if (fs.existsSync(iconsetDir)) fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });

const source = await Jimp.read(sourcePng);
const srcSize = source.width;

// Step-downsample by halves until close, then a final step to the target size.
// Single-pass 1024→16 kills detail; stepping (1024→512→256→…→target) preserves
// more edge structure at each stage. Bicubic resampling at each step.
async function stepDownsample(targetSize) {
    if (targetSize === srcSize) return source.clone();
    let img = source.clone();
    let current = srcSize;
    while (current / 2 >= targetSize) {
        current = Math.floor(current / 2);
        img.resize({ w: current, h: current, mode: ResizeStrategy.BICUBIC });
    }
    if (current !== targetSize) {
        img.resize({ w: targetSize, h: targetSize, mode: ResizeStrategy.BICUBIC });
    }
    return img;
}

for (const slot of slots) {
    const img = await stepDownsample(slot.size);
    await img.write(path.join(iconsetDir, slot.name));
}

if (fs.existsSync(outIcns)) fs.rmSync(outIcns);
execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outIcns], { stdio: 'inherit' });

fs.rmSync(iconsetDir, { recursive: true, force: true });

const stat = fs.statSync(outIcns);
console.log(`✅ Generated ${path.relative(projectRoot, outIcns)} (${(stat.size / 1024).toFixed(1)} KB) via stepped bicubic from ${path.relative(projectRoot, sourcePng)}`);
