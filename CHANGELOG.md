# Releases

## v2.0.3 - iOS Zig engine fix and React Native 0.85 template refresh

This release fixes iOS Zig engine prebuilts for Xcode 26 and refreshes the
project scaffold/example app to the latest `create-react-native-library`
template.

The public FileHash JavaScript API and hash output behavior are unchanged. The
default `native` engine remains unchanged; the iOS fix matters when opting into
the `zig` engine.

### Fixed

- Fixed iOS `zig` engine builds on Xcode 26 by repacking Zig-produced static
  archives with Apple's `libtool`, avoiding linker rejection of archives with
  `not 8-byte aligned` Mach-O members.
- macOS CI now uses Homebrew `zig@0.15` for Zig `0.15.2`, which includes the
  Xcode 26.4 `.tbd` / `Dylib.zig` backport needed to rebuild iOS prebuilts.

### Compatibility

- JavaScript API remains compatible with previous `2.x` releases.
- Android minimum SDK remains `24` (Android 7.0).
- React Native development and example app baseline updated to `0.85.0`.
- React development baseline updated to `19.2.3`.
- Old Architecture compatibility remains available for older React Native
  versions that still support it.
- Old Architecture support is deprecated and will be removed in a future major
  release.
- Both `native` and `zig` engine selection paths remain supported.

### Android

- Updated the example Android project to the current React Native 0.85
  template.
- Updated example Gradle wrapper to `9.3.1`.
- Updated library Android defaults to `compileSdkVersion 36` and
  `targetSdkVersion 36`.
- Kept Android minimum SDK at `24`.
- Kept Android NDK pinned to `27.1.12297006` for reproducible CMake/JNI builds.
- Moved library Android default versions into `android/build.gradle` and removed
  the separate library `android/gradle.properties`.
- Migrated Android lint configuration from `lintOptions` to `lint`.
- Kept `check:16kb` coverage for the final Android `libfilehash-native.so`.
- Kept native and Zig Android hashing behavior unchanged.

### iOS

- Updated the example iOS project and pods for React Native 0.85.
- Updated iOS CI jobs to Xcode `26`.
- Enabled React Native prebuilt dependencies in CI for faster iOS builds.
- Included repacked Zig iOS prebuilts compatible with Xcode 26.
- Preserved the existing Objective-C++ FileHash implementation and bridge
  exports.

### Zig

- iOS Zig prebuilts are rebuilt with archive repacking for Apple's stricter
  Xcode 26 linker checks.
- Android Zig prebuilt generation remains based on Zig cross-compilation and is
  unchanged.

### Tooling and CI

- Updated `create-react-native-library` metadata from `0.55.1` to `0.62.0`.
- Updated Node tooling to Node `24.13.0` in `.nvmrc`.
- Updated Jest to `30.x` with `@react-native/jest-preset` and `@jest/globals`.
- Updated TypeScript, ESLint, Prettier, Turbo, Bob, Commitlint, Lefthook, and
  Release It dependencies to match the refreshed template.
- Excluded generated Gradle/CMake output directories from Turbo Android inputs.
- Added `cpp` to packaged files for future native shared-code layout.

---

## v2.0.2 - Packaging cleanup

### Fixed

- Removed unnecessary runtime dependency on `buffer`.
- Package no longer pulls `buffer` into consumer installs; no API/runtime behavior changes.

---

## v2.0.1 - Switchable engines (`native` / `zig`) and API update

### Breaking changes

- `HashOptions.mode` removed from public API. Passing `mode` now returns `E_INVALID_ARGUMENT`.
- HMAC moved to dedicated algorithms: `HMAC-SHA-224`, `HMAC-SHA-256`,
  `HMAC-SHA-384`, `HMAC-SHA-512`, `HMAC-MD5`, `HMAC-SHA-1`.
- Keyed/plain selection for `BLAKE3` is now inferred from presence of `key`.
- `key` is now valid only for HMAC algorithms and `BLAKE3`; for other
  algorithms it returns `E_INVALID_ARGUMENT`.
- `hashString(...)` was replaced by `stringHash(...)` as the primary API.
  `hashString(...)` remains as a deprecated alias for migration.
- Output contract is fixed: both `fileHash` and `stringHash` return lowercase
  hex digest strings.

### Added

- New optional `zig` engine with stable Zig C ABI integration.
- Build-time engine selection (`native` by default, optional `zig`) for Android
  and iOS.
- Runtime diagnostics APIs:
  - `getRuntimeInfo()`
  - `getRuntimeDiagnostics()`
- Expo config plugin support (`app.plugin.js`) to set engine in prebuild/EAS.
- New benchmark document and size/perf helper scripts:
  - `BENCHMARKS.md`
  - `scripts/compare-size-android.sh`
  - `scripts/compare-size-ios.sh`

### Changed

- Android engine internals split into explicit executors (`NativeHashEngine`,
  `ZigHashEngine`) with shared module routing.
- Android Zig path now uses native fallback for `SHA-224` / `SHA-256` and
  matching HMAC variants in shipped generic Zig setup to avoid SHA-2 latency
  cliffs on devices without ARM64 `sha2` acceleration in prebuilt config.
- iOS bridge refactored into dedicated internal helpers for native and Zig
  paths (`FileHashBridgeNative`, `FileHashBridgeZig`, `FileHashZigHelpers`).
- `fileHash` support for provider-backed paths was hardened on both platforms
  (`content://` on Android, security-scoped/provider URLs on iOS).

### CI / Tooling

- Added reusable Zig setup action (`.github/actions/setup-zig`).
- Expanded CI coverage for native and Zig paths (including Android unit tests
  and runtime smoke flows).

---

## v1.1.3 - 16KB page alignment for Play Store

- What's new
  - Android: enable 16KB page alignment for native library to satisfy Play Store requirements.
  - Guard the linker flag when unsupported; builds continue without 16KB alignment.
  - README: document 16KB alignment and tested NDK (27.1.x).

- Tooling
  - Bump Yarn to 4.12.0 and refresh example locks.

---

## v1.1.2 – bundle native sources in npm package

Fix

- Include vendored native sources (xxhash/blake3) in the npm tarball so iOS builds from npm no longer fail with `xxhash.h file not found`.

Notes

- After clone from git: `git submodule update --init --recursive`.

---

## v1.1.1 – bundle native sources (XXH3/BLAKE3, HMAC/keyed)

### Fix

- Bundled native sources (xxhash/blake3) in the npm package so iOS builds no longer fail with `xxhash.h file not found` and the TurboModule registers correctly.

### Reminder (from 1.1.0)

- Native **XXH3-64/XXH3-128** and **BLAKE3** on iOS/Android.
- `hashString(text, algorithm, encoding?, options?)` for small payloads (utf8/base64); for real files use `fileHash` (streams from disk).
- Modes in `fileHash`/`hashString`: `hash` / `hmac` (SHA-224/256/384/512) / `keyed` (BLAKE3, 32-byte key utf8/hex/base64).
- XXH3-128 output matches official xxHash order (low64 → high64).
- Example app: hash file/string, switch modes, test utf8/hex/base64 keys. Migrated to `create-react-native-library` template (TurboModule, new/old arch).
- README: algorithm table, output lengths, thread-safety note, submodule reminder.

### Notes

- After clone: `git submodule update --init --recursive`.
- Tests: `yarn test`.

---

## v1.1.0 – XXH3 & BLAKE3, hashString, HMAC/keyed modes

- **What’s new**
  - Added native **XXH3-64/XXH3-128** and **BLAKE3** on iOS/Android.
  - New `hashString(text, algorithm, encoding?, options?)` for **small payloads**. Supports `utf8` and `base64` input. For real files always prefer `fileHash`, which streams data from disk.
  - Modes supported in `fileHash` and `hashString`: `hash` / `hmac` / `keyed`
    - **HMAC** — SHA-224/256/384/512 only.
    - **Keyed** — BLAKE3 only, 32-byte key (`utf8` / `hex` / `base64`).
  - **XXH3-128** output matches the official xxHash order (low64 → high64) on both platforms.

- **Example & scaffolding**
  - New example app: hash files or small strings, switch modes (`hash` / `hmac` / `keyed`), and try `utf8` / `hex` / `base64` keys.
  - Project migrated to the `create-react-native-library` template (TurboModule, supports new/old architecture).
  - README: algorithm table and output lengths, thread-safety note, reminder about submodules.

- **Notes**
  - After clone: `git submodule update --init --recursive`.
  - Tests: `yarn test`.

---

## v1.0.5 — Full hash suite, Android coroutines, iOS performance

- Highlights
  - Adds MD5, SHA‑1, SHA‑224, SHA‑256, SHA‑384, SHA‑512 across Android and iOS.
  - Faster async: Android coroutines; iOS OperationQueue + 64 KiB chunks.
  - README updated; CI now publishes only to npmjs.com.

- Android
  - Migrated to Kotlin coroutines with lifecycle-aware cancel in `invalidate()`.
  - Supports `file://`, `content://`, and plain paths; 64 KiB buffer for large files.
  - Explicit mapping to JCA names; unsupported → `E_UNSUPPORTED_ALGORITHM`.

- iOS
  - Uses `OperationQueue` (`maxConcurrentOperationCount = 2`) and 64 KiB chunked reads.
  - SHA‑224 via CommonCrypto (CryptoKit doesn’t provide SHA‑224).
  - Thin Obj‑C extern (`RCT_EXTERN_MODULE`) kept for Old/New Arch robustness.

- JS/Types
  - `THashAlgorithm`: `'MD5' | 'SHA-1' | 'SHA-224' | 'SHA-256' | 'SHA-384' | 'SHA-512'` (default `'SHA-256'`).

- Docs/CI
  - README documents all algorithms and examples.
  - Publishing to GitHub Packages removed to avoid registry conflicts.

- Breaking changes
  - None expected. Public API unchanged; types widened to include more algorithms.

- Upgrade notes
  - If `.npmrc` points `@preeternal` to GitHub Packages, switch to npmjs.com.
  - iOS: run `pod install` after upgrading.
  - Android: ensure `kotlinx-coroutines-android` is available in your build.

---

## v1.0.4

- Fixed compatibility with React Native New Architecture (TurboModules) on Android.
- Now the library works seamlessly with both legacy and new architectures.
- Improved module registration and codegen integration for Android.
- Minor internal refactoring.
  **Full Changelog**: https://github.com/Preeternal/react-native-file-hash/compare/v1.0.2...v1.0.4

---

## Initial Public Release

This is the first stable release of `@preeternal/react-native-file-hash`.

A high-performance native utility for calculating file hashes (MD5 and SHA-256) in React Native applications.

### Features

- ✅ **Native Performance:** All hashing operations are performed in native code (Swift & Kotlin) for maximum speed.
- ✅ **Memory Efficient:** Files are processed in chunks, meaning even very large files can be hashed without loading them entirely into memory.
- ✅ **No UI Freezes:** Hashing is done on a background thread, ensuring a smooth user experience.
- ✅ **Simple API:** A single function `fileHash(filePath, algorithm)` to handle all operations.
- ✅ **Modern Architecture:** Supports both the old and new React Native architectures (TurboModule-ready).
