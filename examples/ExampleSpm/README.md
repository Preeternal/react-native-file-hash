# Swift Package Manager example (React Native 0.87)

This app verifies podless iOS autolinking for
`@preeternal/react-native-file-hash`. Its first setup removes the generated
CocoaPods integration; the library's regular [`example`](../../example) keeps
CocoaPods as the default path.

## iOS with SwiftPM

Install JavaScript dependencies from the repository root, then run:

```sh
yarn workspace ExampleSpm build:ios
```

Both `ios` and `build:ios` regenerate the ignored SwiftPM autolinking output
before invoking Xcode, so they work on a clean checkout and in CI. The initial
CocoaPods-to-SwiftPM migration is already committed; do not run `spm:setup`
again unless the Xcode project is regenerated from a CocoaPods template.

The `ios/Podfile` is only a React Native CLI project-discovery stub. It installs
nothing and deliberately fails if somebody runs `pod install`. The setup
scripts also remove React Native 0.87.1's machine-specific `HERMES_CLI_PATH`
from the committed Xcode files after every SwiftPM refresh.

This example selects Zig with `ZFHEngine` in
[`Info.plist`](./ios/ExampleSpm/Info.plist). Change the value to `native`, or
remove the key, then rerun either `ios` or `build:ios` to use the default
engine. The example's `ios` and `build:ios` scripts run `spm:update` first so
the selected graph is ready before Xcode starts. The generated Swift package
links only the selected core.

To run the app with Metro:

```sh
yarn workspace ExampleSpm start
yarn workspace ExampleSpm ios
```
