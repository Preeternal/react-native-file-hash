# File Hash macOS Example

Minimal React Native macOS example for `@preeternal/react-native-file-hash`.

This example is intentionally separate from `example/` because React Native
macOS currently tracks an older React Native line than the mobile example. It is
still part of the root Yarn workspace, matching the mobile example setup.

## Stack

- `react-native`: `0.81.6`
- `react-native-macos`: `0.81.8`
- File hash backend: Zig only

## Run

```sh
yarn install
cd examples/macos
yarn pods
yarn start
```

In another shell:

```sh
cd examples/macos
yarn macos
```

The app covers:

- runtime diagnostics;
- all Zig-supported algorithms exposed by the mobile example (`MD5`, `SHA-*`,
  `XXH3-64`, `BLAKE3`, `HMAC-*`);
- `stringHash` with `utf8` and `base64` input;
- HMAC/BLAKE3 key options and XXH3 seed options;
- `fileHash` for a file selected through `NSOpenPanel`;
- `fileHash` for a manually entered local path or `file://` URI;
- file hashing benchmark with the same native `BenchmarkFile` helper contract as
  the mobile example;
- cancellation through `AbortController`.

`XXH3-128` remains native-engine-only and is covered by the mobile example.
`content://` is Android-only and remains covered by the mobile example.
