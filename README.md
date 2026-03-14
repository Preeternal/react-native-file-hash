# @preeternal/react-native-file-hash

**Fast, native-first hashing for React Native with switchable engines (`native` / `zig`)**

[![npm version](https://img.shields.io/npm/v/@preeternal/react-native-file-hash.svg)](https://www.npmjs.com/package/@preeternal/react-native-file-hash)
[![npm downloads](https://img.shields.io/npm/dm/@preeternal/react-native-file-hash.svg)](https://www.npmjs.com/package/@preeternal/react-native-file-hash)

One API for file hashing, string hashing, HMAC, and keyed BLAKE3 on iOS and
Android.

Used for:

- verifying large downloads
- caching and deduplication
- content integrity checks
- secure file authentication

Supports out of the box:

- Broad hash coverage: `MD5`, `SHA-1`, `SHA-224`, `SHA-256`, `SHA-384`,
  `SHA-512`, `SHA-512/224`, `SHA-512/256`, `XXH3-64`, `XXH3-128`, `BLAKE3`
- Built-in HMAC coverage: `HMAC-SHA-224`, `HMAC-SHA-256`, `HMAC-SHA-384`,
  `HMAC-SHA-512`, `HMAC-MD5`, `HMAC-SHA-1`
- Keyed `BLAKE3` when you provide a `key` (32 bytes after decoding)

For files, hashing streams data in chunks and does not load the whole file into
memory.
Output format is fixed: both `fileHash` and `stringHash` return lowercase hex
digest strings.

Built for concurrent use: both platforms create independent hash state per
call. iOS uses a dedicated `OperationQueue` (up to 2 concurrent tasks), Android
uses coroutines; in `zig` engine, `stringHash` uses one-shot C ABI, while
`fileHash` uses one-shot path hashing with a streaming fallback for provider and
URL-backed files.

## Features

- ✅ One API, two engines: native or Zig
- ✅ Streaming file hashing (no full-file buffering)
- ✅ Runs hashing work off the JS thread
- ✅ Works with both old and new React Native architecture
- ✅ Supports provider-backed files (`content://`, security-scoped URLs)

## When to use which algorithm

| Algorithm                | Use case                                  | Notes                                                          |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------- |
| MD5                      | Legacy compatibility                      | Not secure, only for compatibility-sensitive workflows         |
| SHA-1                    | Legacy systems                            | Not collision-resistant                                        |
| SHA-224                  | Reduced-size SHA-2                        | iOS `native` uses CommonCrypto; `zig` uses Zig core            |
| SHA-256                  | General-purpose cryptographic hashing     | Good balance of speed and security                             |
| SHA-384/512              | Strong cryptographic guarantees           | Slower, larger output                                          |
| HMAC-SHA-224/256/384/512 | Authenticating data with a shared secret  | Prefer HMAC-SHA-256 for new integrations                       |
| HMAC-MD5 / HMAC-SHA-1    | Legacy protocol compatibility             | Avoid for new designs                                          |
| XXH3-64                  | Fast non-cryptographic hashing            | Best for checksums, caching, deduplication                     |
| XXH3-128                 | Fast non-cryptographic hashing, wider tag | Lower accidental collision rate than XXH3-64; still not crypto |
| BLAKE3                   | Modern high-performance crypto hash       | Supports keyed hashing (`BLAKE3` + `key`)                      |

### Output lengths

| Algorithm              | Output length            |
| ---------------------- | ------------------------ |
| MD5 / HMAC-MD5         | 16 bytes (32 hex chars)  |
| SHA-1 / HMAC-SHA-1     | 20 bytes (40 hex chars)  |
| SHA-224 / HMAC-SHA-224 | 28 bytes (56 hex chars)  |
| SHA-256 / HMAC-SHA-256 | 32 bytes (64 hex chars)  |
| SHA-384 / HMAC-SHA-384 | 48 bytes (96 hex chars)  |
| SHA-512 / HMAC-SHA-512 | 64 bytes (128 hex chars) |
| SHA-512/224            | 28 bytes (56 hex chars)  |
| SHA-512/256            | 32 bytes (64 hex chars)  |
| XXH3-64                | 8 bytes (16 hex chars)   |
| XXH3-128               | 16 bytes (32 hex chars)  |
| BLAKE3                 | 32 bytes (64 hex chars)  |

## Installation

### Using npm

```bash
npm install @preeternal/react-native-file-hash
```

### Using yarn

```bash
yarn add @preeternal/react-native-file-hash
```

### Using Bun

```bash
bun add @preeternal/react-native-file-hash
```

### Linking

For React Native 0.60 and above, the module is linked automatically. For older versions, you might need to link it manually.

## For iOS

```bash
cd ios && bundle exec pod install
```

## For Android

We enable 16KB page alignment when the linker supports `-Wl,-z,max-page-size=16384` to satisfy Google Play requirements on 16KB page size devices. Tested with NDK 27.1.x. If your NDK/toolchain does not recognize the flag, the build will continue without 16KB alignment, so upgrade your NDK to get 16KB-aligned binaries.

## Engine Selection (`native` / `zig`)

Default engine is `native`:

- iOS: Swift implementation (+ native C for BLAKE3/XXH3)
- Android: Kotlin implementation (+ native C for BLAKE3/XXH3)

If no engine flag is provided, `native` is used.
The selected engine is resolved at build time; only that engine is linked into
the final native binary, and the unused engine is not shipped in your app
bundle.

On Android, when `engine=zig`, this package currently routes
`SHA-224` / `SHA-256` and `HMAC-SHA-224` / `HMAC-SHA-256` through the native
pipeline by default. Current shipped Zig Android prebuilts are generic (without
`-Dcpu=...+sha2`), and this fallback removes the main SHA-2 latency cliff.

`XXH3-128` is currently available only in `native` engine.

### Android (`react_native_file_hash_engine`)

Set in app `android/gradle.properties`:

```properties
react_native_file_hash_engine=zig
```

### iOS (`ZFH_ENGINE`)

Set in app `ios/Podfile` before `pod install`:

```ruby
ENV['ZFH_ENGINE'] ||= 'native' # set 'zig' to switch engine
```

For package users: Zig prebuilts are shipped with release artifacts, so no
local Zig toolchain or manual prebuild step is required.

### Expo users

- `Expo Go` is not supported (this library contains native code).
- Use `expo prebuild` / Development Build / EAS Build.
- Engine selection is intended to be configured in `app.json` via config plugin:

```json
{
  "expo": {
    "plugins": [["@preeternal/react-native-file-hash", { "engine": "zig" }]]
  }
}
```

- If `engine` is omitted, default is `native`.
- Plugin behavior (prebuild):
  - sets Android `react_native_file_hash_engine`
  - sets iOS `ZFH_ENGINE` in `Podfile`
- Plugin is bundled with the package (`app.plugin.js`).
- Manual fallback (if needed): set the same values in
  `android/gradle.properties` and `ios/Podfile`.

## Usage

All functions are asynchronous and run on native background threads. They are safe to use with large files and will not block the UI.

```ts
import { fileHash, stringHash } from '@preeternal/react-native-file-hash';

// Get SHA-256 hash for a file
try {
  const sha256 = await fileHash('file:///path/to/your/file.txt', 'SHA-256');
  console.log('SHA-256:', sha256);
} catch (e) {
  console.error(e);
}

// Get MD5 hash for a file
try {
  const md5 = await fileHash('file:///path/to/your/file.txt', 'MD5');
  console.log('MD5:', md5);
} catch (e) {
  console.error(e);
}

// Other algorithms
await fileHash('file:///path/to/your/file.txt', 'SHA-1');
await fileHash('file:///path/to/your/file.txt', 'SHA-224');
await fileHash('file:///path/to/your/file.txt', 'SHA-384');
await fileHash('file:///path/to/your/file.txt', 'SHA-512');
await fileHash('file:///path/to/your/file.txt', 'SHA-512/224');
await fileHash('file:///path/to/your/file.txt', 'SHA-512/256');
await fileHash('file:///path/to/your/file.txt', 'XXH3-64');
await fileHash('file:///path/to/your/file.txt', 'XXH3-128');
await fileHash('file:///path/to/your/file.txt', 'BLAKE3');

// Hash a string (small payloads only; for large data prefer fileHash to avoid keeping everything in JS memory)
const sha256String = await stringHash('hello world', 'SHA-256');
// For base64 input
const blake3String = await stringHash('<base64>', 'BLAKE3', 'base64');

// HMAC
const hmacSha256 = await fileHash('file:///path/to/file', 'HMAC-SHA-256', {
  key: 'super-secret',
  keyEncoding: 'utf8', // 'utf8' | 'hex' | 'base64'
});

// Keyed BLAKE3 (32-byte key)
const blake3Keyed = await fileHash('file:///path/to/file', 'BLAKE3', {
  key: '<32-byte-key-hex-or-base64>',
  keyEncoding: 'hex',
});
```

## API

### `fileHash(filePath, algorithm?, options?)`

Computes the hash of the file at the given `filePath` using the specified
algorithm.

The input should be a local file URI or a platform-provided document URI:

- Android: supports regular `file://` paths and `content://` URIs (for
  example, from the system document picker / SAF).
- iOS: prefers regular local `file://` URLs and also supports provider-backed
  / security-scoped file URLs (for example, from Files / iCloud document
  picker) when the app has access to them.

The function streams file data in fixed-size chunks and never loads the whole
file into memory.

- **`filePath`**: A local file URI or platform-provided document URI.
- **`algorithm`**: Optional, default `'SHA-256'`.
- **`options`**:

  - `key?: string`
  - `keyEncoding?: 'utf8' | 'hex' | 'base64'` (default `'utf8'`)

- **Behavior**:

  - HMAC algorithms are selected via `algorithm` (`HMAC-SHA-*`, `HMAC-MD5`, `HMAC-SHA-1`) and require `key`.
  - `BLAKE3` with `key` uses keyed hashing and requires a 32-byte key after decoding.
  - `BLAKE3` without `key` uses regular hashing.
  - Legacy `mode` option is not supported and returns `E_INVALID_ARGUMENT`.
  - For non-HMAC and non-BLAKE3 algorithms, passing `key` returns `E_INVALID_ARGUMENT`.
  - For `engine=zig`, `XXH3-128` returns an explicit unsupported-algorithm error.

- **Returns**: `Promise<string>` (lowercase hex digest).

### `stringHash(text, algorithm?, encoding?, options?)`

Hashes a small string payload. For large data prefer `fileHash` to stream from disk and avoid extra memory usage.

- **`text`**: Input string.
- **`algorithm`**: Same set as `fileHash`.
- **`encoding`**: `'utf8'` (default) or `'base64'`.
- **`options`**: Same as `fileHash`.
- **Returns**: `Promise<string>` (lowercase hex digest).

### `hashString(text, algorithm?, encoding?, options?)` (deprecated)

Deprecated alias for `stringHash(...)`. It remains available for migration and
will be removed in a future major release.

> ⚠️ **Note** > `stringHash` is intended only for small payloads. For files or large buffers always prefer `fileHash` to avoid excessive memory usage in JavaScript.

## Breaking changes

Compared to `v1.1.3` and earlier:

- `hashString(...)` renamed to `stringHash(...)`.
- `hashString(...)` currently works as a deprecated alias and will be removed in a future major release.
- `mode` removed from `HashOptions` and now rejected with `E_INVALID_ARGUMENT`.
- HMAC moved to dedicated algorithms (`HMAC-SHA-*`, `HMAC-MD5`, `HMAC-SHA-1`).
- `BLAKE3` keyed hashing is inferred automatically when `key` is provided.

## Examples

### Hash a large file efficiently

```ts
import { fileHash } from '@preeternal/react-native-file-hash';

const hash = await fileHash('file:///path/to/large-video.mp4', 'XXH3-128');
```

## Native implementations

- Zig core (optional engine): [Preeternal/zig-files-hash](https://github.com/Preeternal/zig-files-hash)
- XXH3 / XXH128: [Cyan4973/xxHash](https://github.com/Cyan4973/xxHash)
- BLAKE3: [BLAKE3-team/BLAKE3](https://github.com/BLAKE3-team/BLAKE3)

Licenses: xxHash is BSD 2-Clause; the C implementation of BLAKE3 is CC0 (public domain). See `third_party/xxhash/LICENSE` and `third_party/blake3/LICENSE_CC0` (plus accompanying Apache-2.0 notices in `third_party/blake3`).

Performance note: XXH3/BLAKE3 are noticeably slower in Debug (no/low optimization, sanitizer flags, and SIMD may be disabled on simulators). Measure on real devices with Release builds for realistic throughput.

## Zig engine vs Native engine

Full benchmark results are available in [BENCHMARKS.md](./BENCHMARKS.md).

In short:

- Zig engine performs competitively with native on many algorithms.
- Current data already shows Zig wins in part of the matrix (for example iOS
  `SHA-256`, `SHA-224`, `HMAC-SHA-256`, `XXH3-64`) while native wins others.
- Android SHA-2 (`SHA-224` / `SHA-256` and matching HMAC variants) currently
  uses native fallback in shipped Zig setup to avoid generic SHA-2 slowdown.
- Size impact remains small in tests (`+0.49%` APK / `+0.42%` AAB on Android;
  iOS app and main binary were slightly smaller with Zig engine).

## Contributing

Contributions are welcome.
If you have an idea for a new algorithm, engine capability, or API feature,
start a GitHub Discussion first. For bugs and concrete work items, open an
issue.

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Submodules and Zig prebuilts](CONTRIBUTING.md#submodules-and-zig-prebuilts)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
