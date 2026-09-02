# Swift Package Manager example (React Native 0.87)

This app verifies podless iOS autolinking for
`@preeternal/react-native-file-hash`. Its first setup removes the generated
CocoaPods integration; the library's regular [`example`](../../example) keeps
CocoaPods as the default path.

## iOS with SwiftPM

Install JavaScript dependencies from the repository root, then run:

```sh
yarn workspace ExampleSpm spm:setup
yarn workspace ExampleSpm build:ios
```

`spm:setup` removes CocoaPods from the generated project, adds React Native's
Swift packages, and generates the local autolinking package. Run it after a
fresh clone, in CI, and after changing native dependencies.

This example selects Zig with `ZFHEngine` in
[`Info.plist`](./ios/ExampleSpm/Info.plist). Change the value to `native`, or
remove the key, to use the default engine.

To run the app with Metro:

```sh
yarn workspace ExampleSpm start
yarn workspace ExampleSpm ios
```
