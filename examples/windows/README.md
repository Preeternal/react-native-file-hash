# File Hash Windows Example

Minimal React Native Windows example for `@preeternal/react-native-file-hash`.

This example is intentionally separate from `example/` because React Native
Windows currently tracks a different React Native line than the mobile example.
It is still part of the root Yarn workspace, matching the macOS example setup.

## Stack

- `react-native`: `0.84.1`
- `react-native-windows`: `0.84.0`
- File hash backend: Zig only

## Run

React Native Windows CLI currently requires PowerShell 7 (`pwsh.exe`) on
`PATH`. Without it, RNW commands can fail with a misleading `unknown command`
error instead of the real cause; see
[microsoft/react-native-windows#16274](https://github.com/microsoft/react-native-windows/issues/16274).

If the Windows app shell needs to be created or refreshed from the React Native
Windows template, run the official bootstrap command from this example
workspace:

```sh
cd examples/windows
npx react-native init-windows --overwrite
```

The command can overwrite RNW-generated files such as `windows/` and
`metro.config.js`, so re-apply the monorepo Metro config and local app changes
after regenerating.

If RNW points you to
`node_modules/react-native-windows/scripts/rnw-dependencies.ps1`, it is asking
for the Windows development prerequisites. Run the dependency setup from an
elevated PowerShell window, as documented by React Native Windows:

```powershell
Set-ExecutionPolicy Unrestricted -Scope Process -Force
iex (New-Object System.Net.WebClient).DownloadString('https://aka.ms/rnw-vs2022-deps.ps1')
```

```sh
yarn install
yarn workspace @preeternal/react-native-file-hash-windows-example start
```

In another shell on Windows:

```sh
yarn workspace @preeternal/react-native-file-hash-windows-example windows
```

For `Release|ARM64`, the example project runs the x64 Hermes compiler from the
React Native Windows Hermes NuGet package. That package currently ships the
native compiler host tools under `x64` and `x86`, not `arm64`.

The app covers the core JS workflow surface from the mobile and macOS examples:

- runtime diagnostics;
- all Zig-supported algorithms exposed by the mobile example (`MD5`, `SHA-*`,
  `XXH3-64`, `BLAKE3`, `HMAC-*`);
- `stringHash` with `utf8` and `base64` input;
- HMAC/BLAKE3 key options and XXH3 seed options;
- `fileHash` for a manually entered local path or `file://` URI;
- file hashing benchmark with the same app-local `BenchmarkFile` helper contract
  as the mobile and macOS examples;
- cancellation through `AbortController`.

`XXH3-128` remains native-engine-only and is covered by the mobile example.
`content://` is Android-only and remains covered by the mobile example. The
Windows example does not add a native file picker yet.
