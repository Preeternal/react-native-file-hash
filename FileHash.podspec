require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

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
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_INSTALL_OBJC_HEADER" => "YES",
    "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES" => "YES",
    "HEADER_SEARCH_PATHS" => "$(inherited) $(PODS_TARGET_SRCROOT)/third_party/xxhash $(PODS_TARGET_SRCROOT)/third_party/blake3/c",
    # Common flags: disable x86 SIMD
    "OTHER_CFLAGS" => "$(inherited) -DBLAKE3_NO_SSE2=1 -DBLAKE3_NO_SSE41=1 -DBLAKE3_NO_AVX2=1 -DBLAKE3_NO_AVX512=1",
    # Device (arm64): enable NEON
    "OTHER_CFLAGS[sdk=iphoneos*]" => "$(inherited) -DBLAKE3_USE_NEON=1",
    # Simulator arm64: NEON enabled
    "OTHER_CFLAGS[sdk=iphonesimulator*][arch=arm64]" => "$(inherited) -DBLAKE3_USE_NEON=1 -DBLAKE3_NO_SSE2=1 -DBLAKE3_NO_SSE41=1 -DBLAKE3_NO_AVX2=1 -DBLAKE3_NO_AVX512=1",
    # Simulator x86_64: no SIMD, NEON disabled, neon file excluded
    "OTHER_CFLAGS[sdk=iphonesimulator*][arch=x86_64]" => "$(inherited) -DBLAKE3_USE_NEON=0 -DBLAKE3_NO_SIMD=1 -DBLAKE3_NO_NEON=1 -DBLAKE3_NO_SSE2=1 -DBLAKE3_NO_SSE41=1 -DBLAKE3_NO_AVX2=1 -DBLAKE3_NO_AVX512=1",
    "EXCLUDED_SOURCE_FILE_NAMES[sdk=iphonesimulator*][arch=x86_64]" => "third_party/blake3/c/blake3_neon.c"
  }
  s.source_files = [
    "ios/**/*.{h,m,mm,swift}",
    "third_party/xxhash/xxhash.{c,h}",
    "third_party/blake3/c/blake3.c",
    "third_party/blake3/c/blake3_dispatch.c",
    "third_party/blake3/c/blake3_portable.c",
    "third_party/blake3/c/blake3_neon.c"
  ]
  s.public_header_files = [
    "ios/**/*.h"
  ]
  s.private_header_files = [
    "third_party/**/*.h"
  ]

  install_modules_dependencies(s)
end
