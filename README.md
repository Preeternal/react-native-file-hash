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

```bash
npm install react-native-hash-utils
```

OR

```bash
yarn add react-native-hash-utils
```

## For iOS:

```bash
cd ios && pod install
```


## Usage

```ts
import HashUtils from 'react-native-hash-utils';

const hash = await HashUtils.getFileSha256('/path/to/file');
console.log('SHA-256:', hash);

const md5 = await HashUtils.md5Hash('/path/to/file');
console.log('MD5:', md5);
```
## License

MIT

