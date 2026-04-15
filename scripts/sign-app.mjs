// electron-builder afterPack hook.
// Recursively ad-hoc signs the packaged app — including the bundled Chromium
// under Contents/Resources/playwright-browsers. Without this, macOS silently
// refuses to spawn the nested Chromium when the outer .app is downloaded
// (the quarantine bit + inconsistent ad-hoc signatures are a Gatekeeper trap).

import path from 'path';
import { execSync } from 'child_process';

export default async function afterPack(context) {
    if (context.electronPlatformName !== 'darwin') return;

    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    console.log(`🔐 sign-app: ad-hoc signing ${appPath}`);

    try {
        execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
        console.log('✅ sign-app: done');
    } catch (err) {
        console.error('❌ sign-app: codesign failed', err);
        throw err;
    }
}
