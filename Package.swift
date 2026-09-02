// swift-tools-version: 6.0

import PackageDescription

let reactHeaders: [Target.Dependency] = [
  .product(name: "ReactHeaders", package: "ReactNative"),
  .product(name: "ReactNativeHeaders", package: "ReactNative"),
  .product(name: "ReactNativeDependenciesHeaders", package: "ReactNative"),
  .product(name: "ReactAppHeaders", package: "React-GeneratedCode"),
]

let package = Package(
  name: "ReactNativeFileHash",
  platforms: [.iOS(.v15)],
  products: [
    .library(name: "ReactNativeFileHash", targets: ["ReactNativeFileHash"]),
  ],
  dependencies: [
    // These paths are supplied by React Native's SPM autolinker under
    // ios/build/generated/autolinking/libs/ReactNativeFileHash.
    .package(name: "ReactNative", path: "../../../../xcframeworks"),
    .package(name: "React-GeneratedCode", path: "../../../ios"),
  ],
  targets: [
    .binaryTarget(
      name: "ZigFilesHash",
      path: "third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework"
    ),
    .target(
      name: "FileHashNativeCore",
      path: "ios/NativeCore",
      publicHeadersPath: ".",
      cSettings: [
        .headerSearchPath("../../third_party/xxhash"),
        .headerSearchPath("../../third_party/blake3/c"),
        .define("BLAKE3_NO_SSE2", to: "1"),
        .define("BLAKE3_NO_SSE41", to: "1"),
        .define("BLAKE3_NO_AVX2", to: "1"),
        .define("BLAKE3_NO_AVX512", to: "1"),
      ],
      cxxSettings: [
        .headerSearchPath("../../third_party/xxhash"),
        .headerSearchPath("../../third_party/blake3/c"),
        .define("BLAKE3_NO_SSE2", to: "1"),
        .define("BLAKE3_NO_SSE41", to: "1"),
        .define("BLAKE3_NO_AVX2", to: "1"),
        .define("BLAKE3_NO_AVX512", to: "1"),
      ]
    ),
    .target(
      name: "FileHashNative",
      dependencies: ["FileHashNativeCore"] + reactHeaders,
      path: "ios/NativeSwift",
      linkerSettings: [
        .linkedFramework("CryptoKit"),
        .linkedFramework("Foundation"),
        .linkedFramework("Security"),
      ]
    ),
    .target(
      name: "ReactNativeFileHash",
      dependencies: ["FileHashNative", "ZigFilesHash"] + reactHeaders,
      path: "ios",
      sources: [
        "ReactNative/FileHash.h",
        "ReactNative/FileHash.mm",
        "ReactNative/FileHashBridgeHelpers.h",
        "ReactNative/FileHashPromiseTypes.h",
        "ReactNative/FileHashBridgeHelpers.mm",
        "ReactNative/FileHashBridgeNative.h",
        "ReactNative/FileHashBridgeNative.m",
        "FileHashBridgeZig.h",
        "FileHashBridgeZig.mm",
        "FileHashZigHelpers.h",
        "FileHashZigHelpers.mm",
      ],
      publicHeadersPath: "ReactNative",
      cSettings: [
        .headerSearchPath("ReactNative"),
        .headerSearchPath("."),
        .define("ZFH_ENGINE_ZIG", to: "1"),
        .define("ZFH_SPM_DUAL_ENGINE", to: "1"),
      ],
      cxxSettings: [
        .headerSearchPath("ReactNative"),
        .headerSearchPath("."),
        .unsafeFlags([
          "-DFOLLY_NO_CONFIG",
          "-DFOLLY_MOBILE=1",
          "-DFOLLY_USE_LIBCPP=1",
          "-DFOLLY_CFG_NO_COROUTINES=1",
          "-DFOLLY_HAVE_CLOCK_GETTIME=1",
          "-Wno-comma",
          "-Wno-shorten-64-to-32",
          "-DRN_FABRIC_ENABLED",
          "-fno-modules",
        ]),
        .define("ZFH_ENGINE_ZIG", to: "1"),
        .define("ZFH_SPM_DUAL_ENGINE", to: "1"),
        .define("DEBUG", .when(configuration: .debug)),
        .define("NDEBUG", .when(configuration: .release)),
      ],
      linkerSettings: [
        .linkedFramework("Foundation"),
      ]
    ),
  ],
  swiftLanguageModes: [.v5],
  cxxLanguageStandard: .cxx20
)
