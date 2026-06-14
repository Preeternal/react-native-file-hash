# @preeternal/react-native-file-hash

Native streaming hashes for React Native files, strings, HMAC, XXH3, and
BLAKE3.

[![npm version](https://img.shields.io/npm/v/@preeternal/react-native-file-hash.svg)](https://www.npmjs.com/package/@preeternal/react-native-file-hash)
[![npm downloads](https://img.shields.io/npm/dm/@preeternal/react-native-file-hash.svg)](https://www.npmjs.com/package/@preeternal/react-native-file-hash)

Use it when your app needs to verify large downloads, fingerprint media,
deduplicate local files or cached uploads, generate fast cache keys, compare
local content, or authenticate data with HMAC or keyed BLAKE3.

Hash multi-GB files without loading them into JavaScript. Native code streams
files in chunks, keeps the work off the JS thread, and returns a lowercase hex
digest. Large inputs do not cross the JS bridge or sit in JS memory, which helps
avoid memory spikes and OOM crashes.

## Highlights

- Streams file data from disk instead of loading the whole file into JS memory.
- Uses native background work on iOS and Android, keeping the UI responsive.
- Safe for concurrent calls: each operation owns its native hash state.
- Defaults to `SHA-256` when you do not pass an algorithm.
- Supports `AbortController` cancellation for long-running file hashes.
- Supports local files, Android `content://` URIs, and iOS provider-backed file
  URLs when the app has access.
- Returns lowercase hex strings for every algorithm.
- Includes native-side SHA variants, HMAC algorithms, XXH3, BLAKE3, and keyed
  BLAKE3.

## Installation

```bash
npm install @preeternal/react-native-file-hash
```

or:

```bash
yarn add @preeternal/react-native-file-hash
```

or:

```bash
bun add @preeternal/react-native-file-hash
```

React Native 0.60+ autolinks the native module.

For iOS, install pods:

```bash
cd ios
bundle exec pod install
```

### Expo

`Expo Go` is not supported because this package contains native code. Use a
Development Build, EAS Build, or `expo prebuild`.

For the default native engine, no plugin options are required:

```json
{
  "expo": {
    "plugins": ["@preeternal/react-native-file-hash"]
  }
}
```

## Quick Start

```ts
import { fileHash, stringHash } from '@preeternal/react-native-file-hash';

const digest = await fileHash('file:///path/to/video.mp4');
// SHA-256 lowercase hex by default

const xxh3 = await fileHash('file:///path/to/video.mp4', {
  algorithm: 'XXH3-64',
});

const textDigest = await stringHash('hello world');
```

For large payloads, prefer `fileHash`. `stringHash` is intended for small
strings or small base64 payloads already in JS memory.

## Cancel Long Hashes

Cancellation follows the same shape as `fetch` and many HTTP clients:

```ts
import { fileHash } from '@preeternal/react-native-file-hash';

const controller = new AbortController();

const promise = fileHash(fileUri, {
  algorithm: 'SHA-256',
  signal: controller.signal,
});

controller.abort();

try {
  await promise;
} catch (error) {
  if (
    error instanceof Error &&
    error.name === 'AbortError' &&
    (error as { code?: string }).code === 'E_CANCELLED'
  ) {
    // Hash was cancelled.
  }
}
```

Cancellation is cooperative. Large file hashes stop at chunk boundaries. Small
`stringHash` calls may finish before the abort is observed.

## HMAC And Keyed BLAKE3

HMAC is selected by the algorithm name:

```ts
const hmac = await fileHash(fileUri, {
  algorithm: 'HMAC-SHA-256',
  hashOptions: {
    key: 'super-secret',
    keyEncoding: 'utf8',
  },
});
```

Keyed BLAKE3 uses the regular `BLAKE3` algorithm with a key. The decoded key
must be 32 bytes:

```ts
const keyed = await fileHash(fileUri, {
  algorithm: 'BLAKE3',
  hashOptions: {
    key: '3031323334353637383961626364656630313233343536373839616263646566',
    keyEncoding: 'hex',
  },
});
```

`keyEncoding` can be `'utf8'`, `'hex'`, or `'base64'`. The default is `'utf8'`.

## API

### `fileHash(filePath, request?)`

Hashes a file by streaming it from native code.

```ts
const digest = await fileHash(fileUri, {
  algorithm: 'SHA-256',
  hashOptions: {
    key: 'optional-key',
    keyEncoding: 'utf8',
  },
  signal: abortController.signal,
});
```

`filePath` can be:

- a local path or `file://` URI;
- an Android `content://` URI, for example from the system document picker;
- an iOS provider-backed file URL, for example from Files or iCloud, when the
  app has access.

If `request.algorithm` is omitted, `SHA-256` is used.

### `stringHash(text, request?)`

Hashes a small JS string or base64 payload.

```ts
const digest = await stringHash('hello world', {
  algorithm: 'SHA-256',
  encoding: 'utf8',
});

const fromBase64 = await stringHash(base64Payload, {
  algorithm: 'BLAKE3',
  encoding: 'base64',
});
```

If `request.algorithm` is omitted, `SHA-256` is used. If `request.encoding` is
omitted, `utf8` is used.

### Request Types

```ts
type HashRequest = {
  algorithm?: THashAlgorithm;
  hashOptions?: HashOptions;
  signal?: HashAbortSignal;
};

type StringHashRequest = HashRequest & {
  encoding?: 'utf8' | 'base64';
};

type HashOptions = {
  key?: string;
  keyEncoding?: 'utf8' | 'hex' | 'base64';
};
```

The exported `HashAbortSignal` type is intentionally compatible with
`AbortController.signal`.

### Deprecated Call Forms

The positional overloads still work, but the object-style request API is the
recommended form because it avoids placeholder arguments and supports
cancellation cleanly.

```ts
// Deprecated, still supported for migration.
await fileHash(fileUri, 'SHA-256');
await stringHash('hello', 'SHA-256', 'utf8');

// Recommended.
await fileHash(fileUri, { algorithm: 'SHA-256' });
await stringHash('hello', { algorithm: 'SHA-256', encoding: 'utf8' });
```

`hashString(...)` is a deprecated alias for `stringHash(...)` and will be
removed in a future major release.

## Algorithms

| Algorithm                                        | Use case                                   | Notes                                                   |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------- |
| `SHA-256`                                        | Default general-purpose cryptographic hash | Good default for integrity checks                       |
| `SHA-384`, `SHA-512`                             | Stronger SHA-2 variants                    | Larger output, usually slower                           |
| `SHA-224`, `SHA-512/224`, `SHA-512/256`          | SHA-2 compatibility variants               | Useful for protocols requiring these exact digests      |
| `MD5`, `SHA-1`                                   | Legacy compatibility                       | Do not use for new security-sensitive designs           |
| `HMAC-SHA-256`                                   | Shared-secret authentication               | Good default HMAC choice                                |
| `HMAC-SHA-224/384/512`, `HMAC-MD5`, `HMAC-SHA-1` | Protocol compatibility                     | Prefer SHA-256+ for new designs                         |
| `XXH3-64`, `XXH3-128`                            | Fast non-cryptographic checksums           | Great for caching and deduplication, not authentication |
| `BLAKE3`                                         | Modern high-performance hash               | Also supports keyed mode with a 32-byte key             |

### Output Lengths

| Algorithm                                          | Output length           |
| -------------------------------------------------- | ----------------------- |
| `MD5`, `HMAC-MD5`                                  | 16 bytes, 32 hex chars  |
| `SHA-1`, `HMAC-SHA-1`                              | 20 bytes, 40 hex chars  |
| `SHA-224`, `HMAC-SHA-224`                          | 28 bytes, 56 hex chars  |
| `SHA-256`, `HMAC-SHA-256`, `SHA-512/256`, `BLAKE3` | 32 bytes, 64 hex chars  |
| `SHA-384`, `HMAC-SHA-384`                          | 48 bytes, 96 hex chars  |
| `SHA-512`, `HMAC-SHA-512`                          | 64 bytes, 128 hex chars |
| `SHA-512/224`                                      | 28 bytes, 56 hex chars  |
| `XXH3-64`                                          | 8 bytes, 16 hex chars   |
| `XXH3-128`                                         | 16 bytes, 32 hex chars  |

## Error Handling

Common error codes:

| Code                                   | Meaning                                           |
| -------------------------------------- | ------------------------------------------------- |
| `E_CANCELLED`                          | Operation was cancelled through `AbortController` |
| `E_INVALID_ARGUMENT`                   | Invalid algorithm/options combination             |
| `E_INVALID_KEY`                        | Key cannot be decoded or has the wrong length     |
| `E_INVALID_INPUT`                      | Invalid string input, usually malformed base64    |
| `E_FILE_NOT_FOUND`                     | File cannot be opened                             |
| `E_UNSUPPORTED_ALGORITHM`              | Algorithm is not available in the selected engine |
| `E_HASH_FAILED` / `E_FILE_HASH_FAILED` | Native hashing failed unexpectedly                |

Key rules:

- HMAC algorithms require `hashOptions.key`.
- `BLAKE3` uses keyed mode only when `hashOptions.key` is provided.
- `BLAKE3` keyed mode requires a 32-byte key after decoding.
- Other algorithms reject `hashOptions.key`.
- `HashOptions.mode` was removed and is rejected with `E_INVALID_ARGUMENT`.

## Runtime Info

```ts
import {
  getRuntimeDiagnostics,
  getRuntimeInfo,
} from '@preeternal/react-native-file-hash';

const info = await getRuntimeInfo();
// { engine: 'native' } or { engine: 'zig' }

const diagnostics = await getRuntimeDiagnostics();
```

`getRuntimeDiagnostics()` includes Zig ABI/core metadata when the Zig engine is
selected. For the default native engine, consumers usually do not need it.

## Performance

Use physical devices and Release builds for performance claims. Debug,
simulator, and emulator runs are useful for smoke checks, but they do not
represent production throughput.

Full current measurements live in [BENCHMARKS.md](./BENCHMARKS.md).

Practical guidance:

- Start with the default `native` engine for most apps.
- Consider `zig` when you care about specific algorithms or want a portable
  hashing core; check [BENCHMARKS.md](./BENCHMARKS.md) for current device data.
- Use `SHA-256` for general integrity checks.
- Use `XXH3-64` or `XXH3-128` for fast non-security checksums.
- Use `HMAC-SHA-256` for shared-secret authentication.
- Avoid `MD5` and `SHA-1` for new security-sensitive designs.

## Optional: Engine Selection

This library ships with two build-time engines:

- `native`: the default engine, recommended for most apps.
- `zig`: an optional engine built on the bundled
  [`zig-files-hash`](https://github.com/Preeternal/zig-files-hash) core.

The `native` engine uses platform implementations plus native C for BLAKE3 and
XXH3. The `zig` engine can be useful when you want one portable hashing core
shared across bindings, when you want to validate behavior against the Zig
implementation, or when current benchmarks favor Zig for the algorithms you
use. See [BENCHMARKS.md](./BENCHMARKS.md) for the latest engine comparison.

Package users do not need a local Zig toolchain; release artifacts include Zig
prebuilts.

The selected engine is resolved at build time. The unused engine is not linked
into the final native binary.

### Android

Set this in your app's `android/gradle.properties`:

```properties
react_native_file_hash_engine=zig
```

If the property is omitted, `native` is used.

Android Zig currently routes `SHA-224`, `SHA-256`, `HMAC-SHA-224`, and
`HMAC-SHA-256` through the native pipeline in the shipped generic prebuilt
setup to avoid ARM SHA-2 latency cliffs.

### iOS

Set this in your app's `ios/Podfile` before `pod install`:

```ruby
ENV['ZFH_ENGINE'] ||= 'zig'
```

If `ZFH_ENGINE` is omitted, `native` is used.

### Expo Engine Selection

```json
{
  "expo": {
    "plugins": [["@preeternal/react-native-file-hash", { "engine": "zig" }]]
  }
}
```

If `engine` is omitted, `native` is used.

### Engine Compatibility Notes

- `XXH3-128` is currently available only in the `native` engine.

## Android 16 KB Page Size

The Android build enables 16 KB page alignment when the linker supports
`-Wl,-z,max-page-size=16384`, matching Google Play requirements for newer
16 KB page size devices. Tested with NDK 27.1.x.

If your NDK/toolchain does not recognize the flag, the build continues without
16 KB alignment. Upgrade the NDK to produce 16 KB-aligned binaries.

## Native Implementations

- XXH3 / XXH128: [Cyan4973/xxHash](https://github.com/Cyan4973/xxHash)
- BLAKE3: [BLAKE3-team/BLAKE3](https://github.com/BLAKE3-team/BLAKE3)
- Optional Zig core:
  [Preeternal/zig-files-hash](https://github.com/Preeternal/zig-files-hash)

Licenses: xxHash is BSD 2-Clause; the C implementation of BLAKE3 is CC0
(public domain). See `third_party/xxhash/LICENSE` and
`third_party/blake3/LICENSE_CC0`, plus accompanying Apache-2.0 notices in
`third_party/blake3`.

## Contributing

Contributions are welcome.

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Submodules and Zig prebuilts](CONTRIBUTING.md#submodules-and-zig-prebuilts)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT. See [LICENSE](LICENSE) for details.

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob).
