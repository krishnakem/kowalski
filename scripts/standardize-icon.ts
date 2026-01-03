
import { Jimp } from "jimp";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function standardizeIcon() {
    // 1. Source: The clean, full-bleed content (100% zoom)
    const iconPath = path.join(__dirname, '../build/icon-maximized.png');
    const outputPath = path.join(__dirname, '../build/icon-standard.png');

    console.log(`🍎 Standardizing Icon to Apple HIG Grid...`);

    try {
        const image = await Jimp.read(iconPath);

        // Apple HIG Specification for macOS 11+
        // Canvas: 1024x1024
        // Keyline Shape (Squircle): 824x824
        // (This allows room for the drop shadow)
        const CANVAS_SIZE = 1024;
        const TARGET_SIZE = 824;

        console.log(`Target Content Size: ${TARGET_SIZE}x${TARGET_SIZE}`);

        // 2. Resize content to the standard App Icon Box size
        image.resize({ w: TARGET_SIZE, h: TARGET_SIZE });

        // 3. Create the Shape Mask (Apple Superellipse)
        // We mask the 824x824 content directly
        const mask = new Jimp({ width: TARGET_SIZE, height: TARGET_SIZE, color: 0x00000000 });
        const n = 4.8; // Apple's continuos curve factor
        const cx = TARGET_SIZE / 2;
        const cy = TARGET_SIZE / 2;
        const rx = TARGET_SIZE / 2;
        const ry = TARGET_SIZE / 2;

        for (let y = 0; y < TARGET_SIZE; y++) {
            for (let x = 0; x < TARGET_SIZE; x++) {
                const normX = (x - cx + 0.5) / rx;
                const normY = (y - cy + 0.5) / ry;
                const dist = Math.pow(Math.abs(normX), n) + Math.pow(Math.abs(normY), n);

                if (dist <= 1) {
                    mask.setPixelColor(0xFFFFFFFF, x, y);
                } else {
                    mask.setPixelColor(0x00000000, x, y);
                }
            }
        }

        // Apply mask to the content
        image.mask(mask, 0, 0);

        // 4. Place on the 1024x1024 Canvas
        const canvas = new Jimp({ width: CANVAS_SIZE, height: CANVAS_SIZE, color: 0x00000000 });
        const x = (CANVAS_SIZE - TARGET_SIZE) / 2;
        const y = (CANVAS_SIZE - TARGET_SIZE) / 2;

        // Important: Standard macOS icons have a subtle drop shadow. 
        // We can simulate a basic one or leave it flat. 
        // For strict "Standardization", sticking to the size is step 1.
        // Let's create a shadow layer for professional polish.

        // Simple shadow simulation:
        // Create a black copy of the shape, blur it, reduce opacity, place it behind.
        // (Jimp blur is expensive/slow in JS, skipping blur for speed unless requested).
        // Sticking to crisp sizing for now.

        canvas.composite(image, x, y);

        await canvas.write(outputPath);
        console.log(`✅ Standardized icon generated at: ${outputPath}`);

    } catch (error) {
        console.error("Error processing icon:", error);
        process.exit(1);
    }
}

standardizeIcon();
