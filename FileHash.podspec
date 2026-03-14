require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
engine = (ENV["ZFH_ENGINE"] || "native").downcase
zig_xcframework = "third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework"
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

if engine == "zig" && !File.directory?(File.join(__dir__, zig_xcframework))
  raise "Zig prebuilt is missing (#{zig_xcframework}). Run: ./scripts/build-zig-ios.sh"
end

Pod::Spec.new do |s|
  s.name         = "FileHash"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.static_framework = true

  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/Preeternal/react-native-file-hash.git", :tag => "#{s.version}" }

  s.swift_version = "5.9"
  header_search_paths = if is_zig
    "$(inherited) $(PODS_TARGET_SRCROOT)/third_party/zig-files-hash/src"
  else
    "$(inherited) $(PODS_TARGET_SRCROOT)/third_party/xxhash $(PODS_TARGET_SRCROOT)/third_party/blake3/c"
  end

  common_cflags = if is_zig
    "$(inherited)"
  else
    "$(inherited) -DBLAKE3_NO_SSE2=1 -DBLAKE3_NO_SSE41=1 -DBLAKE3_NO_AVX2=1 -DBLAKE3_NO_AVX512=1"
  end

  ios_cflags = is_zig ? "$(inherited)" : "$(inherited) -DBLAKE3_USE_NEON=1"
  sim_arm64_cflags = is_zig ? "$(inherited)" : "$(inherited) -DBLAKE3_USE_NEON=1 -DBLAKE3_NO_SSE2=1 -DBLAKE3_NO_SSE41=1 -DBLAKE3_NO_AVX2=1 -DBLAKE3_NO_AVX512=1"
  sim_x64_cflags = is_zig ? "$(inherited)" : "$(inherited) -DBLAKE3_USE_NEON=0 -DBLAKE3_NO_SIMD=1 -DBLAKE3_NO_NEON=1 -DBLAKE3_NO_SSE2=1 -DBLAKE3_NO_SSE41=1 -DBLAKE3_NO_AVX2=1 -DBLAKE3_NO_AVX512=1"
  excluded_sources_x64 = is_zig ? "" : "third_party/blake3/c/blake3_neon.c"

  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_INSTALL_OBJC_HEADER" => "YES",
    "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES" => "YES",
    "GCC_PREPROCESSOR_DEFINITIONS" =>
      "$(inherited) #{engine == "zig" ? "ZFH_ENGINE_ZIG=1" : "ZFH_ENGINE_NATIVE=1"} ZFH_ZIG_CORE_VERSION=\\\"#{zig_core_version}\\\"",
    "HEADER_SEARCH_PATHS" => header_search_paths,
    "OTHER_CFLAGS" => common_cflags,
    "OTHER_CFLAGS[sdk=iphoneos*]" => ios_cflags,
    "OTHER_CFLAGS[sdk=iphonesimulator*][arch=arm64]" => sim_arm64_cflags,
    "OTHER_CFLAGS[sdk=iphonesimulator*][arch=x86_64]" => sim_x64_cflags,
    "EXCLUDED_SOURCE_FILE_NAMES[sdk=iphonesimulator*][arch=x86_64]" => excluded_sources_x64
  }
  if is_zig
    s.source_files = [
      "ios/FileHash.h",
      "ios/FileHash.mm",
      "ios/FileHashBridgeHelpers.h",
      "ios/FileHashBridgeHelpers.mm",
      "ios/FileHashBridgeZig.h",
      "ios/FileHashBridgeZig.mm",
      "ios/FileHashZigHelpers.h",
      "ios/FileHashZigHelpers.mm"
    ]
    s.public_header_files = [
      "ios/FileHash.h"
    ]
    s.private_header_files = [
      "ios/FileHashBridgeHelpers.h",
      "ios/FileHashBridgeZig.h",
      "ios/FileHashZigHelpers.h"
    ]
    s.vendored_frameworks = zig_xcframework
  else
    s.source_files = [
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
    s.public_header_files = [
      "ios/FileHash.h"
    ]
    s.private_header_files = [
      "ios/FileHashBridgeNative.h",
      "ios/FileHashBridgeHelpers.h",
      "third_party/**/*.h"
    ]
  end

  install_modules_dependencies(s)
end
