#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

usage() {
  echo "Usage: $0 [path-to-tarball]" >&2
}

if [[ $# -gt 1 ]]; then
  usage
  exit 1
fi

if [[ $# -eq 1 ]]; then
  TARBALL="$1"
else
  (
    cd "${ROOT_DIR}"
    npm_config_cache="${TMP_DIR}/npm-cache" \
      npm pack --silent --ignore-scripts --pack-destination "${TMP_DIR}" >/dev/null
  )
  TARBALL_NAME="$(find "${TMP_DIR}" -maxdepth 1 -name '*.tgz' -type f -exec basename {} \; | tail -n1)"
  TARBALL="${TMP_DIR}/${TARBALL_NAME}"
fi

if [[ ! -f "${TARBALL}" ]]; then
  echo "Tarball not found: ${TARBALL}" >&2
  exit 1
fi

REQUIRED_PATHS=$(cat <<'EOF'
package/app.plugin.js
package/FileHash.podspec
package/react-native.config.js
package/windows/FileHash.sln
package/windows/FileHash/FileHash.def
package/windows/FileHash/FileHash.cpp
package/windows/FileHash/FileHash.h
package/windows/FileHash/FileHash.rc
package/windows/FileHash/FileHash.vcxproj
package/windows/FileHash/ReactPackageProvider.cpp
package/windows/FileHash/ReactPackageProvider.h
package/windows/FileHash/ReactPackageProvider.idl
package/windows/FileHash/pch.cpp
package/windows/FileHash/pch.h
package/windows/FileHash/resource.h
package/windows/FileHash/targetver.h
package/windows/FileHash/codegen/FileHashSpecJSI.h
package/windows/FileHash/codegen/NativeFileHashSpec.g.h
package/third_party/xxhash/LICENSE
package/third_party/xxhash/xxhash.c
package/third_party/xxhash/xxhash.h
package/third_party/blake3/LICENSE_A2
package/third_party/blake3/LICENSE_A2LLVM
package/third_party/blake3/LICENSE_CC0
package/third_party/blake3/c/blake3.c
package/third_party/blake3/c/blake3.h
package/third_party/blake3/c/blake3_dispatch.c
package/third_party/blake3/c/blake3_impl.h
package/third_party/blake3/c/blake3_portable.c
package/third_party/blake3/c/blake3_neon.c
package/third_party/zig-files-hash/LICENSE
package/third_party/zig-files-hash/build.zig.zon
package/third_party/zig-files-hash/src/zig_files_hash_c_api.h
package/third_party/zig-files-hash/src/zig_files_hash_c_api_generated.h
package/third_party/zig-files-hash-prebuilt/android/arm64-v8a/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/android/armeabi-v7a/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/android/x86/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/android/x86_64/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/Info.plist
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64/Headers/zig_files_hash_c_api.h
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64/Headers/zig_files_hash_c_api_generated.h
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64_x86_64-simulator/Headers/zig_files_hash_c_api.h
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64_x86_64-simulator/Headers/zig_files_hash_c_api_generated.h
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64_x86_64-simulator/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/macos/ZigFilesHash.xcframework/Info.plist
package/third_party/zig-files-hash-prebuilt/macos/ZigFilesHash.xcframework/macos-arm64_x86_64/Headers/zig_files_hash_c_api.h
package/third_party/zig-files-hash-prebuilt/macos/ZigFilesHash.xcframework/macos-arm64_x86_64/Headers/zig_files_hash_c_api_generated.h
package/third_party/zig-files-hash-prebuilt/macos/ZigFilesHash.xcframework/macos-arm64_x86_64/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/windows/ARM64/zig_files_hash.lib
package/third_party/zig-files-hash-prebuilt/windows/Win32/zig_files_hash.lib
package/third_party/zig-files-hash-prebuilt/windows/x64/zig_files_hash.lib
EOF
)

FORBIDDEN_PATTERNS=$(cat <<'EOF'
^package/third_party/xxhash/(tests|cli|doc|build|fuzz)/
^package/third_party/blake3/(b3sum|benches|src|test_vectors|tools|reference_impl|media)/
^package/third_party/blake3/c/(blake3_avx|blake3_sse|blake3_tbb|example|main|test|CMake|dependencies|blake3_c_rust_bindings)
^package/third_party/zig-files-hash/src/.*\.zig$
^package/third_party/zig-files-hash/tools/
^package/third_party/zig-files-hash/(\.zig-cache|zig-out)/
^package/third_party/zig-files-hash-prebuilt/.*/Headers/.*\.zig$
EOF
)

CONTENTS_FILE="${TMP_DIR}/tar-contents.txt"
tar -tf "${TARBALL}" > "${CONTENTS_FILE}"

missing=()
while IFS= read -r path; do
  [[ -n "${path}" ]] || continue
  if ! grep -Fxq "${path}" "${CONTENTS_FILE}"; then
    missing+=("${path}")
  fi
done <<EOF
${REQUIRED_PATHS}
EOF

if (( ${#missing[@]} > 0 )); then
  echo "Packaged tarball is missing required artifacts:" >&2
  printf '  - %s
' "${missing[@]}" >&2
  exit 1
fi

for pattern in ${FORBIDDEN_PATTERNS}; do
  if grep -Eq "${pattern}" "${CONTENTS_FILE}"; then
    echo "Packaged tarball contains unnecessary third_party content matching:" >&2
    echo "  ${pattern}" >&2
    grep -E "${pattern}" "${CONTENTS_FILE}" | sed 's/^/  - /' >&2
    exit 1
  fi
done

echo "Verified packaged artifacts in: ${TARBALL}"
