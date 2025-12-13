# @preeternal/react-native-file-hash

**Cross-platform native hash utilities for React Native (MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512, XXH3, BLAKE3)**

[![npm version](https://img.shields.io/npm/v/@preeternal/react-native-file-hash.svg)](https://www.npmjs.com/package/@preeternal/react-native-file-hash)
[![npm downloads](https://img.shields.io/npm/dm/@preeternal/react-native-file-hash.svg)](https://www.npmjs.com/package/@preeternal/react-native-file-hash)

Simple and fast native hashing utilities for React Native.

Supports MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512, XXH3-64/XXH3-128, and BLAKE3 hash calculation for local files on iOS and Android, **without loading the entire file into memory**.

Ideal for large files — hashing is performed in chunks directly from disk using native code.

Modern API (CryptoKit & CommonCrypto in Swift, coroutines in Kotlin).

Thread-safety: both platforms create independent hash states per call. iOS uses a dedicated `OperationQueue` (up to 2 concurrent tasks) and Android uses coroutines/independent JNI states, so concurrent invocations are safe; consider the queue limits on iOS if you expect heavy parallelism.

## Features

- ✅ MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512, XXH3-64/XXH3-128, BLAKE3
- ✅ High-performance native implementation
- ✅ Does not load the entire file into memory
- ✅ Prevents UI freezes
- ✅ Supports both old and new React Native architecture (TurboModules ready)
- ℹ️ Notes: SHA-224 uses CommonCrypto on iOS

## When to use which algorithm

| Algorithm   | Use case                              | Notes                                          |
| ----------- | ------------------------------------- | ---------------------------------------------- |
| MD5         | Legacy compatibility                  | Not secure, fastest among cryptographic hashes |
| SHA-1       | Legacy systems                        | Not collision-resistant                        |
| SHA-224     | Reduced-size SHA-2                    | Uses CommonCrypto on iOS                       |
| SHA-256     | General-purpose cryptographic hashing | Good balance of speed and security             |
| SHA-384/512 | Strong cryptographic guarantees       | Slower, larger output                          |
| XXH3-64     | Fast non-cryptographic hashing        | Best for checksums, deduplication              |
| XXH3-128    | Collision-resistant fast hashing      | Larger output than XXH3-64                     |
| BLAKE3      | Modern high-performance crypto hash   | Supports keyed mode, tree hashing              |

### Output lengths (hex)

| Algorithm   | Output length |
| ----------- | ------------- |
| MD5         | 32 chars      |
| SHA-1       | 40 chars      |
| SHA-224     | 56 chars      |
| SHA-256     | 64 chars      |
| SHA-384     | 96 chars      |
| SHA-512     | 128 chars     |
| XXH3-64     | 16 bytes → 32 hex chars |
| XXH3-128    | 32 bytes → 64 hex chars |
| BLAKE3      | 32 bytes → 64 hex chars |

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

## Usage

All functions are asynchronous and run on native background threads. They are safe to use with large files and will not block the UI.

```ts
import { fileHash, hashString } from '@preeternal/react-native-file-hash';

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
await fileHash('file:///path/to/your/file.txt', 'XXH3-64');
await fileHash('file:///path/to/your/file.txt', 'XXH3-128');
await fileHash('file:///path/to/your/file.txt', 'BLAKE3');

// Hash a string (small payloads only; for large data prefer fileHash to avoid keeping everything in JS memory)
const sha256String = await hashString('hello world', 'SHA-256');
// For base64 input
const blake3String = await hashString('<base64>', 'BLAKE3', 'base64');

// HMAC (SHA-256/384/512/224)
const hmacSha256 = await fileHash('file:///path/to/file', 'SHA-256', {
  mode: 'hmac',
  key: 'super-secret',
  keyEncoding: 'utf8', // 'utf8' | 'hex' | 'base64'
});

// Keyed BLAKE3 (32-byte key)
const blake3Keyed = await fileHash('file:///path/to/file', 'BLAKE3', {
  mode: 'keyed',
  key: '<32-byte-key-hex-or-base64>',
  keyEncoding: 'hex',
});
```

## API

### `fileHash(filePath: string, algorithm: THashAlgorithm, options?: HashOptions): Promise<string>`

Computes the hash of the file at the given `filePath` using the specified algorithm. The path must be a valid file URI (e.g., `file:///path/to/file` from an app-accessible location like `RNFS.DocumentDirectoryPath` from `react-native-fs`. The function streams the file from disk in fixed-size chunks and never loads the whole file into memory.

- **`filePath`**: The URI of the file.
- **`algorithm`**: The hash algorithm to use. One of `'MD5' | 'SHA-1' | 'SHA-224' | 'SHA-256' | 'SHA-384' | 'SHA-512' | 'XXH3-64' | 'XXH3-128' | 'BLAKE3'`

Default algorithm is 'SHA-256'.

- **`options`**: Optional hashing mode:
  - `mode: 'hash' | 'hmac' | 'keyed'` (default `'hash'`)
  - `key`: required for `hmac`/`keyed` (string)
  - `keyEncoding`: `'utf8' | 'hex' | 'base64'` (default `'utf8'`)
  - HMAC is supported only for `SHA-224/256/384/512`. Keyed mode is supported only for `BLAKE3` with a 32-byte key (after decoding). XXH3/MD5 are not available in keyed/HMAC modes.

If an unsupported mode is used with a given algorithm, the promise will reject with a descriptive error.

- **Returns**: A `Promise` that resolves with the hash string.

### `hashString(text: string, algorithm: THashAlgorithm, encoding?: 'utf8' | 'base64', options?: HashOptions): Promise<string>`

Hashes a small string payload. For large data prefer `fileHash` to stream from disk and avoid extra memory usage.

- **`text`**: Input string. If `encoding` is `'base64'`, this should be a base64-encoded string; otherwise treated as UTF-8.
- **`algorithm`**: Same set as `fileHash`.
- **`encoding`**: `'utf8'` (default) or `'base64'`.
- **`options`**: Same as `fileHash`.
- **Returns**: A `Promise` that resolves with the hex-encoded hash string.

> ⚠️ **Note** > `hashString` is intended only for small payloads. For files or large buffers always prefer `fileHash` to avoid excessive memory usage in JavaScript.

## Examples

### Hash a large file efficiently

```ts
import { fileHash } from '@preeternal/react-native-file-hash';

const hash = await fileHash('file:///path/to/large-video.mp4', 'XXH3-128');
```

## Native implementations

- XXH3 / XXH128: [Cyan4973/xxHash](https://github.com/Cyan4973/xxHash)
- BLAKE3: [BLAKE3-team/BLAKE3](https://github.com/BLAKE3-team/BLAKE3)

Licenses: xxHash is BSD 2-Clause; the C implementation of BLAKE3 is CC0 (public domain). See `third_party/xxhash/LICENSE` and `third_party/blake3/LICENSE_CC0` (plus accompanying Apache-2.0 notices in `third_party/blake3`).

Performance note: XXH3/BLAKE3 are noticeably slower in Debug (no/low optimization, sanitizer flags, and SIMD may be disabled on simulators). Measure on real devices with Release builds for realistic throughput.

## Contributing

Cloning from git: we vendor xxHash (v0.8.2) and BLAKE3 (v1.5.4) via git submodules. After cloning the repository, run:

```bash
git submodule update --init --recursive
```

Contributions are welcome! Please feel free to open an issue or submit a pull request.

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
