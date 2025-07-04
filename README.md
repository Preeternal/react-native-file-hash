# react-native-file-hash
**Cross-platform native hash utilities for React Native (MD5, SHA-256)**

Simple and fast native hashing utilities for React Native.

Supports SHA-256 and MD5 hash calculation for local files on both iOS and Android, **without loading the entire file into memory**.

Ideal for large files — hashing is performed in chunks directly from disk using native code.

Modern API (CryptoKit in Swift, try-with-resources in Kotlin).

## Features

- ✅ SHA-256 and MD5 hash for local files
- ✅ High-performance native implementation
- ✅ Does not load the entire file into memory
- ✅ Prevents UI freezes
- ✅ Supports both old and new React Native architecture (TurboModules ready)

## Installation

### Using npm

```bash
npm install react-native-file-hash
```

### Using yarn

```bash
yarn add react-native-file-hash
```

### Using Bun

```bash
bun add react-native-file-hash
```

### Linking

For React Native 0.60 and above, the module is linked automatically. For older versions, you might need to link it manually.

## For iOS

```bash
cd ios && bundle exec pod install
```

## Usage

```ts
import { getFileSha256, md5Hash } from '@preeternal/react-native-file-hash';

// Get SHA-256 hash for a file
try {
  const sha256 = await getFileSha256('file:///path/to/your/file.txt');
  console.log('SHA-256:', sha256);
} catch (e) {
  console.error(e);
}

// Get MD5 hash for a file
try {
  const md5 = await md5Hash('file:///path/to/your/file.txt');
  console.log('MD5:', md5);
} catch (e) {
  console.error(e);
}
```

## API

### `getFileSha256(filePath: string): Promise<string>`

Computes the SHA-256 hash of the file at the given `filePath`. The path must be a valid file URI (e.g., `file:///path/to/file` from an app-accessible location like `RNFS.DocumentDirectoryPath` from `react-native-fs`).

- **`filePath`**: The URI of the file.
- **Returns**: A `Promise` that resolves with the SHA-256 hash string.

### `md5Hash(filePath: string): Promise<string>`

Computes the MD5 hash of the file at the given `filePath`. The path must be a valid file URI (e.g., `file:///path/to/file` from an app-accessible location like `RNFS.DocumentDirectoryPath` from `react-native-fs`).

- **`filePath`**: The URI of the file.
- **Returns**: A `Promise` that resolves with the MD5 hash string.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
