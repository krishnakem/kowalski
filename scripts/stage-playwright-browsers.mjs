import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const stageRoot = path.join(projectRoot, 'build-resources', 'playwright-browsers');

function playwrightCacheDir() {
    const home = os.homedir();
    if (process.platform === 'darwin') return path.join(home, 'Library/Caches/ms-playwright');
    if (process.platform === 'win32') return path.join(home, 'AppData/Local/ms-playwright');
    return path.join(home, '.cache/ms-playwright');
}

// Read the chromium revision the installed playwright-core actually uses.
// Bundling the WRONG revision (e.g. the highest one in a polluted shared
// cache) means Playwright won't find its expected browser at runtime and
// will silently fail to launch.
function expectedChromiumDir() {
    const browsersJsonPath = path.join(projectRoot, 'node_modules', 'playwright-core', 'browsers.json');
    const browsersJson = JSON.parse(fs.readFileSync(browsersJsonPath, 'utf8'));
    const chromium = browsersJson.browsers.find(b => b.name === 'chromium');
    if (!chromium) throw new Error('chromium entry not found in playwright-core/browsers.json');
    return `chromium-${chromium.revision}`;
}

function ensureChromiumInstalled(cacheDir) {
    const expected = expectedChromiumDir();
    if (fs.existsSync(path.join(cacheDir, expected))) return expected;
    console.log(`📥 Installing Playwright Chromium ${expected} (not in cache)...`);
    execSync('npx playwright install chromium', { stdio: 'inherit' });
    if (!fs.existsSync(path.join(cacheDir, expected))) {
        throw new Error(`Expected ${expected} not present after install`);
    }
    return expected;
}

function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dst, entry.name);
        if (entry.isSymbolicLink()) {
            const link = fs.readlinkSync(s);
            fs.symlinkSync(link, d);
        } else if (entry.isDirectory()) {
            copyDir(s, d);
        } else {
            fs.copyFileSync(s, d);
            try {
                const mode = fs.statSync(s).mode;
                fs.chmodSync(d, mode);
            } catch {}
        }
    }
}

function main() {
    const cacheDir = playwrightCacheDir();
    const chromiumDirName = ensureChromiumInstalled(cacheDir);
    // Headless mode uses chrome-headless-shell, a separate binary. Both must
    // be bundled or `headless: true` launches will fail in production.
    const headlessShellDirName = chromiumDirName.replace('chromium-', 'chromium_headless_shell-');

    if (fs.existsSync(stageRoot)) {
        fs.rmSync(stageRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(stageRoot, { recursive: true });

    for (const dirName of [chromiumDirName, headlessShellDirName]) {
        const src = path.join(cacheDir, dirName);
        if (!fs.existsSync(src)) {
            console.log(`📥 ${dirName} not in cache, running playwright install...`);
            execSync('npx playwright install chromium', { stdio: 'inherit' });
            if (!fs.existsSync(src)) throw new Error(`${dirName} still missing after install`);
        }
        const dst = path.join(stageRoot, dirName);
        console.log(`📦 Staging ${dirName} → ${path.relative(projectRoot, dst)}`);
        copyDir(src, dst);
    }

    console.log('✅ Playwright browsers staged for packaging.');
}

main();
