require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
engine = (ENV["ZFH_ENGINE"] || "native").downcase
zig_ios_xcframework = "third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework"
zig_macos_xcframework = "third_party/zig-files-hash-prebuilt/macos/ZigFilesHash.xcframework"
is_zig = engine == "zig"
zig_core_version = begin
  zon_path = File.join(__dir__, "third_party/zig-files-hash/build.zig.zon")
  if File.exist?(zon_path)
    zon = File.read(zon_path)
    match = zon.match(/version\s*=\s*"([^"]+)"/)
    match ? "v#{match[1]}" : "unknown"
  else
    "unknown"
  end
end

unless %w[native zig].include?(engine)
  raise "ZFH_ENGINE must be 'native' or 'zig' (got '#{engine}')"
end

if engine == "zig" && !File.directory?(File.join(__dir__, zig_ios_xcframework))
  raise "iOS Zig prebuilt is missing (#{zig_ios_xcframework}). Run: ./scripts/build-zig-ios.sh"
end

zig_source_files = [
  "ios/FileHash.h",
  "ios/FileHash.mm",
  "ios/FileHashBridgeHelpers.h",
  "ios/FileHashBridgeHelpers.mm",
  "ios/FileHashBridgeZig.h",
  "ios/FileHashBridgeZig.mm",
  "ios/FileHashZigHelpers.h",
  "ios/FileHashZigHelpers.mm"
]

zig_private_header_files = [
  "ios/FileHashBridgeHelpers.h",
  "ios/FileHashBridgeZig.h",
  "ios/FileHashZigHelpers.h"
]

native_source_files = [
  "ios/FileHash.h",
  "ios/FileHash.mm",
  "ios/FileHash.swift",
  "ios/HashNative.h",
  "ios/HashNative.mm",
  "ios/FileHashBridgeHelpers.h",
  "ios/FileHashBridgeHelpers.mm",
  "ios/FileHashBridgeNative.h",
  "ios/FileHashBridgeNative.m",
  "third_party/xxhash/xxhash.{c,h}",
  "third_party/blake3/c/blake3.c",
  "third_party/blake3/c/blake3_dispatch.c",
  "third_party/blake3/c/blake3_portable.c",
  "third_party/blake3/c/blake3_neon.c"
]

Pod::Spec.new do |s|
  s.name         = "FileHash"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.static_framework = true

  s.platforms    = { :ios => "13.0", :osx => "10.15" }
  s.source       = { :git => "https://github.com/Preeternal/react-native-file-hash.git", :tag => "#{s.version}" }

  s.swift_version = "5.9"
  native_header_search_paths = "$(inherited) $(PODS_TARGET_SRCROOT)/third_party/xxhash $(PODS_TARGET_SRCROOT)/third_party/blake3/c"
  zig_header_search_paths = "$(inherited) $(PODS_TARGET_SRCROOT)/third_party/zig-files-hash/src"

  ios_header_search_paths = if is_zig
    zig_header_search_paths
  else
    native_header_search_paths
  end

  ios_common_cflags = if is_zig
    "$(inherited)"
  else
    "$(inherited) -DBLAKE3_NO_SSE2=1 -DBLAKE3_NO_SSE41=1 -DBLAKE3_NO_AVX2=1 -DBLAKE3_NO_AVX512=1"
  end

  ios_cflags = is_zig ? "$(inherited)" : "$(inherited) -DBLAKE3_USE_NEON=1"
  sim_arm64_cflags = is_zig ? "$(inherited)" : "$(inherited) -DBLAKE3_USE_NEON=1 -DBLAKE3_NO_SSE2=1 -DBLAKE3_NO_SSE41=1 -DBLAKE3_NO_AVX2=1 -DBLAKE3_NO_AVX512=1"
  sim_x64_cflags = is_zig ? "$(inherited)" : "$(inherited) -DBLAKE3_USE_NEON=0 -DBLAKE3_NO_SIMD=1 -DBLAKE3_NO_NEON=1 -DBLAKE3_NO_SSE2=1 -DBLAKE3_NO_SSE41=1 -DBLAKE3_NO_AVX2=1 -DBLAKE3_NO_AVX512=1"
  excluded_sources_x64 = is_zig ? "" : "third_party/blake3/c/blake3_neon.c"

  s.ios.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_INSTALL_OBJC_HEADER" => "YES",
    "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES" => "YES",
    "GCC_PREPROCESSOR_DEFINITIONS" =>
      "$(inherited) #{engine == "zig" ? "ZFH_ENGINE_ZIG=1" : "ZFH_ENGINE_NATIVE=1"} ZFH_ZIG_CORE_VERSION=\\\"#{zig_core_version}\\\"",
    "HEADER_SEARCH_PATHS" => ios_header_search_paths,
    "OTHER_CFLAGS" => ios_common_cflags,
    "OTHER_CFLAGS[sdk=iphoneos*]" => ios_cflags,
    "OTHER_CFLAGS[sdk=iphonesimulator*][arch=arm64]" => sim_arm64_cflags,
    "OTHER_CFLAGS[sdk=iphonesimulator*][arch=x86_64]" => sim_x64_cflags,
    "EXCLUDED_SOURCE_FILE_NAMES[sdk=iphonesimulator*][arch=x86_64]" => excluded_sources_x64
  }

  s.osx.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES" => "YES",
    "GCC_PREPROCESSOR_DEFINITIONS" =>
      "$(inherited) ZFH_ENGINE_ZIG=1 ZFH_ZIG_CORE_VERSION=\\\"#{zig_core_version}\\\"",
    "HEADER_SEARCH_PATHS" => zig_header_search_paths,
    "OTHER_CFLAGS" => "$(inherited)"
  }

  s.osx.source_files = zig_source_files
  s.osx.public_header_files = [
    "ios/FileHash.h"
  ]
  s.osx.private_header_files = zig_private_header_files
  s.osx.vendored_frameworks = zig_macos_xcframework

  if is_zig
    s.ios.source_files = zig_source_files
    s.ios.public_header_files = [
      "ios/FileHash.h"
    ]
    s.ios.private_header_files = zig_private_header_files
    s.ios.vendored_frameworks = zig_ios_xcframework
  else
    s.ios.source_files = native_source_files
    s.ios.public_header_files = [
      "ios/FileHash.h"
    ]
    s.ios.private_header_files = [
      "ios/FileHashBridgeNative.h",
      "ios/FileHashBridgeHelpers.h",
      "third_party/**/*.h"
    ]
  end

  install_modules_dependencies(s)
end
