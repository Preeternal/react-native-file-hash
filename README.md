# @preeternal/react-native-file-hash

**Cross-platform native hash utilities for React Native (MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512)**

[![npm version](https://img.shields.io/npm/v/@preeternal/react-native-file-hash.svg)](https://www.npmjs.com/package/@preeternal/react-native-file-hash)
[![npm downloads](https://img.shields.io/npm/dm/@preeternal/react-native-file-hash.svg)](https://www.npmjs.com/package/@preeternal/react-native-file-hash)

Simple and fast native hashing utilities for React Native.

Supports MD5, SHA-1, SHA-224, SHA-256, SHA-384, and SHA-512 hash calculation for local files on iOS and Android, **without loading the entire file into memory**.

Ideal for large files — hashing is performed in chunks directly from disk using native code.

Modern API (CryptoKit & CommonCrypto in Swift, coroutines in Kotlin).

## Features

- ✅ MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512
- ✅ High-performance native implementation
- ✅ Does not load the entire file into memory
- ✅ Prevents UI freezes
- ✅ Supports both old and new React Native architecture (TurboModules ready)
- ℹ️ Notes: SHA-224 uses CommonCrypto on iOS

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

```ts
import { fileHash, THashAlgorithm } from '@preeternal/react-native-file-hash';

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
```

## API

### `fileHash(filePath: string, algorithm: THashAlgorithm): Promise<string>`

Computes the hash of the file at the given `filePath` using the specified algorithm. The path must be a valid file URI (e.g., `file:///path/to/file` from an app-accessible location like `RNFS.DocumentDirectoryPath` from `react-native-fs`).

- **`filePath`**: The URI of the file.
- **`algorithm`**: The hash algorithm to use. One of `'MD5' | 'SHA-1' | 'SHA-224' | 'SHA-256' | 'SHA-384' | 'SHA-512'` (default `'SHA-256'`).
- **Returns**: A `Promise` that resolves with the hash string.

### `THashAlgorithm`

A type representing the supported hash algorithms: `'MD5' | 'SHA-1' | 'SHA-224' | 'SHA-256' | 'SHA-384' | 'SHA-512'`.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
