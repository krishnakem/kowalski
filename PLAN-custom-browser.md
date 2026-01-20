# PLAN: Custom Kowalski Browser Branding

This document outlines the implementation plan for branding Playwright's Chromium instance ("Google Chrome for Testing") as "Kowalski" with custom name, icon, and bundle identifier.

---

## Current State Analysis

### What's Already Implemented

1. **ChromiumVersionHelper.ts** ([src/main/services/ChromiumVersionHelper.ts](src/main/services/ChromiumVersionHelper.ts))
   - `getCustomExecutablePath()` (lines 187-207) already returns path to `Kowalski.app`:
     ```
     ~/Library/Caches/ms-playwright/chromium-{revision}/chrome-mac-arm64/Kowalski.app/Contents/MacOS/Google Chrome for Testing
     ```
   - Dynamic revision detection via `getLatestRevision()`
   - Cross-platform path handling (macOS, Windows, Linux)

2. **BrowserManager.ts** ([src/main/services/BrowserManager.ts](src/main/services/BrowserManager.ts))
   - Lines 89-100: Already checks for custom executable path and falls back to Playwright default
   - Uses `ChromiumVersionHelper.getCustomExecutablePath()` for stealth/branding

3. **Icon Assets** (in `/build/` directory)
   - `icon.icns` - macOS app icon bundle
   - `icon.ico` - Windows icon
   - `icon.png` - Base PNG (likely 1024x1024)
   - Multiple sized PNGs: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512

### Known Issues

1. **Icon appears blurry** - The current icon replacement method may not be using properly optimized icon sizes for Retina displays
2. **No automated setup** - Browser branding must be done manually after Playwright install
3. **Bundle identifier unchanged** - Still shows "Google Chrome for Testing" in Activity Monitor
4. **Executable name unchanged** - Still named "Google Chrome for Testing" inside MacOS folder

---

## Phase 1: The Setup Script

### File: `scripts/setup-kowalski-browser.ts`

A TypeScript script that runs post-Playwright-install to brand the Chromium browser.

### 1.1 Script Structure

```typescript
// scripts/setup-kowalski-browser.ts

interface PlatformConfig {
  browserPath: string;        // Path to chromium folder in playwright cache
  appBundlePath: string;      // Path to .app bundle (macOS only)
  executablePath: string;     // Path to actual executable
  iconSource: string;         // Path to our icon asset
}

async function main() {
  // 1. Detect platform
  // 2. Find Playwright cache location
  // 3. Find installed Chromium revision
  // 4. Apply branding based on platform
  // 5. Re-sign the app (macOS only)
}
```

### 1.2 macOS Implementation Details

#### 1.2.1 Locate the Chromium Installation

```
~/Library/Caches/ms-playwright/chromium-{revision}/chrome-mac-arm64/
```

- Scan for `chromium-*` directories (exclude `chromium-headless-shell-*`)
- Use highest revision number (same logic as `ChromiumVersionHelper.getLatestRevision()`)

#### 1.2.2 Rename the App Bundle

| From | To |
|------|-----|
| `Google Chrome for Testing.app` | `Kowalski.app` |

**Important:** Only rename the `.app` folder, NOT the executable inside MacOS folder (that would break Playwright's hardcoded references).

#### 1.2.3 Modify Info.plist

Location: `Kowalski.app/Contents/Info.plist`

| Key | Original Value | New Value |
|-----|----------------|-----------|
| `CFBundleName` | Google Chrome for Testing | Kowalski |
| `CFBundleDisplayName` | Google Chrome for Testing | Kowalski |
| `CFBundleIdentifier` | com.google.Chrome.for.Testing | com.kowalski.browser |
| `CFBundleExecutable` | Google Chrome for Testing | (keep unchanged) |

**Implementation:**
- Use Node.js `plist` package to parse/modify/serialize
- OR use shell command: `plutil -convert xml1` → regex replace → `plutil -convert binary1`
- Simpler approach: Use `sed` or direct string replacement since plist is XML

#### 1.2.4 Replace the Icon

Location: `Kowalski.app/Contents/Resources/app.icns`

**Current Problem (Blurry Icon):**
The icon may be blurry because:
1. The `.icns` file doesn't contain all required sizes for Retina
2. macOS caches icons aggressively

**Solution:**
1. Ensure `build/icon.icns` contains all sizes: 16, 32, 64, 128, 256, 512, 1024 (both @1x and @2x)
2. Copy `build/icon.icns` → `Kowalski.app/Contents/Resources/app.icns`
3. Also copy to `Kowalski.app/Contents/Resources/chrome.icns` (Chrome uses this too)
4. Touch the app bundle to invalidate icon cache: `touch Kowalski.app`
5. Clear icon cache: `rm -rf ~/Library/Caches/com.apple.iconservices*`

**ICNS Size Requirements for Retina:**
```
icon_16x16.png      (16x16)
icon_16x16@2x.png   (32x32)
icon_32x32.png      (32x32)
icon_32x32@2x.png   (64x64)
icon_128x128.png    (128x128)
icon_128x128@2x.png (256x256)
icon_256x256.png    (256x256)
icon_256x256@2x.png (512x512)
icon_512x512.png    (512x512)
icon_512x512@2x.png (1024x1024)
```

#### 1.2.5 Re-sign the App Bundle

After modifying the bundle, the code signature is broken. Must re-sign:

```bash
codesign --force --deep --sign - "Kowalski.app"
```

- `--force`: Overwrite existing signature
- `--deep`: Sign all nested code (frameworks, helpers)
- `--sign -`: Ad-hoc signing (no developer certificate required)

**Important:** Without re-signing, macOS Gatekeeper will block the app from running.

### 1.3 Windows Implementation Details

#### 1.3.1 Locate the Chromium Installation

```
%LOCALAPPDATA%\ms-playwright\chromium-{revision}\chrome-win\
```

#### 1.3.2 Rename the Executable

| From | To |
|------|-----|
| `chrome.exe` | `Kowalski.exe` |

**Note:** May also need to update `ChromiumVersionHelper.getCustomExecutablePath()` for Windows.

#### 1.3.3 Replace the Icon

Use `rcedit` npm package to modify the embedded icon:

```bash
npx rcedit "Kowalski.exe" --set-icon "build/icon.ico"
```

Also update version info:
```bash
npx rcedit "Kowalski.exe" --set-product-name "Kowalski"
npx rcedit "Kowalski.exe" --set-file-description "Kowalski Browser"
```

### 1.4 Linux Implementation Details

#### 1.4.1 Locate the Chromium Installation

```
~/.cache/ms-playwright/chromium-{revision}/chrome-linux/
```

#### 1.4.2 Rename the Executable

| From | To |
|------|-----|
| `chrome` | `Kowalski` |

#### 1.4.3 Create Desktop Entry (Optional)

Create `~/.local/share/applications/kowalski.desktop`:
```ini
[Desktop Entry]
Name=Kowalski
Exec=/path/to/Kowalski
Icon=/path/to/icon.png
Type=Application
```

### 1.5 Error Handling

The setup script must handle:
1. **Playwright not installed** - Exit gracefully with instructions
2. **No chromium revision found** - Prompt user to run `npx playwright install chromium`
3. **Permission denied** - Request elevated permissions or provide manual instructions
4. **Already branded** - Skip if `Kowalski.app` already exists (idempotent)
5. **Codesign failure** - Warn but continue (app may still work on same machine)

### 1.6 Logging

Output clear, actionable logs:
```
🔍 Detecting Playwright Chromium installation...
✅ Found Chromium revision 1255 at ~/Library/Caches/ms-playwright/chromium-1255
📦 Renaming bundle: Google Chrome for Testing.app → Kowalski.app
📝 Updating Info.plist...
   - CFBundleName: Kowalski
   - CFBundleIdentifier: com.kowalski.browser
🎨 Replacing icon with build/icon.icns...
🔐 Re-signing app bundle...
✅ Kowalski browser setup complete!
```

---

## Phase 2: Integration

### 2.1 Update ChromiumVersionHelper.ts

No changes needed - already returns correct path to `Kowalski.app`.

However, verify that `getCustomExecutablePath()` returns the correct executable name inside the bundle:
- Current: `Kowalski.app/Contents/MacOS/Google Chrome for Testing`
- This is correct because we're NOT renaming the executable, only the bundle.

### 2.2 Update BrowserManager.ts

No changes needed - already checks for custom executable and falls back gracefully.

### 2.3 Verification Function

Add a helper to verify branding is applied:

```typescript
// In ChromiumVersionHelper.ts

static isBrandingApplied(): boolean {
    const execPath = this.getCustomExecutablePath();
    return fs.existsSync(execPath);
}

static getBrandingStatus(): {
    branded: boolean;
    path: string;
    revision: string;
    reason?: string;
} {
    const revision = this.getLatestRevision();
    const execPath = this.getCustomExecutablePath();

    if (!fs.existsSync(execPath)) {
        return {
            branded: false,
            path: execPath,
            revision,
            reason: 'Kowalski.app not found. Run: npm run setup:browser'
        };
    }

    return { branded: true, path: execPath, revision };
}
```

---

## Phase 3: Automation

### 3.1 NPM Script

Add to `package.json`:

```json
{
  "scripts": {
    "setup:browser": "npx tsx scripts/setup-kowalski-browser.ts",
    "postinstall": "npm run setup:browser || true"
  }
}
```

**Note:** `|| true` ensures npm install doesn't fail if branding fails (e.g., Playwright not yet installed).

### 3.2 Alternative: Lifecycle Script

Instead of postinstall, create a separate setup command that runs after initial project setup:

```json
{
  "scripts": {
    "setup": "npm install && npx playwright install chromium && npm run setup:browser"
  }
}
```

### 3.3 Git Ignore

The branded browser is in the Playwright cache (outside the repo), so no `.gitignore` changes needed.

However, add a note in README about running the setup script after fresh clone.

### 3.4 CI/CD Considerations

For CI/CD builds:
1. Run `npx playwright install chromium` first
2. Run `npm run setup:browser`
3. Proceed with build/test

---

## Phase 4: Icon Quality Fix

### 4.1 Problem Analysis

The current blurry icon is likely caused by:
1. Missing @2x Retina versions in the `.icns` file
2. macOS icon cache not being cleared
3. Icon sizes not matching Apple's requirements exactly

### 4.2 Solution: Regenerate icon.icns

#### Step 1: Create iconset folder

```bash
mkdir build/Kowalski.iconset
```

#### Step 2: Generate all required sizes from source

Using a 1024x1024 source PNG:

```bash
# Standard sizes
sips -z 16 16     build/icon.png --out build/Kowalski.iconset/icon_16x16.png
sips -z 32 32     build/icon.png --out build/Kowalski.iconset/icon_16x16@2x.png
sips -z 32 32     build/icon.png --out build/Kowalski.iconset/icon_32x32.png
sips -z 64 64     build/icon.png --out build/Kowalski.iconset/icon_32x32@2x.png
sips -z 128 128   build/icon.png --out build/Kowalski.iconset/icon_128x128.png
sips -z 256 256   build/icon.png --out build/Kowalski.iconset/icon_128x128@2x.png
sips -z 256 256   build/icon.png --out build/Kowalski.iconset/icon_256x256.png
sips -z 512 512   build/icon.png --out build/Kowalski.iconset/icon_256x256@2x.png
sips -z 512 512   build/icon.png --out build/Kowalski.iconset/icon_512x512.png
sips -z 1024 1024 build/icon.png --out build/Kowalski.iconset/icon_512x512@2x.png
```

#### Step 3: Convert to .icns

```bash
iconutil -c icns build/Kowalski.iconset -o build/icon.icns
```

#### Step 4: Cleanup

```bash
rm -rf build/Kowalski.iconset
```

### 4.3 Add Icon Generation Script

Create `scripts/generate-icons.sh`:

```bash
#!/bin/bash
# Generates properly sized .icns file for macOS

SOURCE="build/icon.png"
ICONSET="build/Kowalski.iconset"

# Check source exists
if [ ! -f "$SOURCE" ]; then
    echo "❌ Source icon not found: $SOURCE"
    exit 1
fi

# Create iconset directory
mkdir -p "$ICONSET"

# Generate all sizes
sips -z 16 16     "$SOURCE" --out "$ICONSET/icon_16x16.png"
sips -z 32 32     "$SOURCE" --out "$ICONSET/icon_16x16@2x.png"
sips -z 32 32     "$SOURCE" --out "$ICONSET/icon_32x32.png"
sips -z 64 64     "$SOURCE" --out "$ICONSET/icon_32x32@2x.png"
sips -z 128 128   "$SOURCE" --out "$ICONSET/icon_128x128.png"
sips -z 256 256   "$SOURCE" --out "$ICONSET/icon_128x128@2x.png"
sips -z 256 256   "$SOURCE" --out "$ICONSET/icon_256x256.png"
sips -z 512 512   "$SOURCE" --out "$ICONSET/icon_256x256@2x.png"
sips -z 512 512   "$SOURCE" --out "$ICONSET/icon_512x512.png"
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon_512x512@2x.png"

# Convert to icns
iconutil -c icns "$ICONSET" -o "build/icon.icns"

# Cleanup
rm -rf "$ICONSET"

echo "✅ Generated build/icon.icns with all Retina sizes"
```

---

## Implementation Checklist

### Phase 1: Setup Script
- [ ] Create `scripts/setup-kowalski-browser.ts`
- [ ] Implement Playwright cache detection
- [ ] Implement macOS branding (rename, plist, icon, codesign)
- [ ] Implement Windows branding (rcedit)
- [ ] Implement Linux branding (rename)
- [ ] Add comprehensive error handling
- [ ] Add logging

### Phase 2: Integration
- [ ] Verify `ChromiumVersionHelper.getCustomExecutablePath()` works correctly
- [ ] Add `isBrandingApplied()` helper function (optional)
- [ ] Test BrowserManager fallback behavior

### Phase 3: Automation
- [ ] Add `setup:browser` npm script
- [ ] Decide on postinstall vs manual setup approach
- [ ] Update README with setup instructions

### Phase 4: Icon Quality
- [ ] Create `scripts/generate-icons.sh`
- [ ] Regenerate `build/icon.icns` with all Retina sizes
- [ ] Test icon appearance on Retina display
- [ ] Clear macOS icon cache after setup

---

## Dependencies to Add

```json
{
  "devDependencies": {
    "plist": "^3.1.0"    // For parsing/modifying Info.plist (optional, can use sed)
  }
}
```

For Windows:
```json
{
  "devDependencies": {
    "rcedit": "^4.0.1"   // For modifying Windows executable resources
  }
}
```

---

## Testing Plan

1. **Fresh Install Test**
   - Delete `~/Library/Caches/ms-playwright/chromium-*`
   - Run `npx playwright install chromium`
   - Run `npm run setup:browser`
   - Verify Kowalski.app exists and launches

2. **Icon Quality Test**
   - Launch Kowalski browser in headed mode
   - Check Dock icon clarity on Retina display
   - Check Activity Monitor shows "Kowalski" not "Google Chrome"

3. **Fallback Test**
   - Delete Kowalski.app but keep original
   - Verify BrowserManager falls back to default Playwright browser
   - Verify warning is logged

4. **Update Test**
   - Simulate Playwright update (new chromium revision)
   - Run setup script again
   - Verify new revision is branded

---

## Notes

- The executable inside `MacOS/` folder stays as "Google Chrome for Testing" to maintain Playwright compatibility
- Only the `.app` bundle name, Info.plist metadata, and icons are changed
- Ad-hoc signing (`--sign -`) works for local development; production distribution would need proper certificates
- The setup script should be idempotent (safe to run multiple times)
