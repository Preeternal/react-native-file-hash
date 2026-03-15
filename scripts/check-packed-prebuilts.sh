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
  TARBALL_NAME="$(cd "${ROOT_DIR}" && npm pack --silent --ignore-scripts --pack-destination "${TMP_DIR}" | tail -n1)"
  TARBALL="${TMP_DIR}/${TARBALL_NAME}"
fi

if [[ ! -f "${TARBALL}" ]]; then
  echo "Tarball not found: ${TARBALL}" >&2
  exit 1
fi

REQUIRED_PATHS=$(cat <<'EOF'
package/app.plugin.js
package/FileHash.podspec
package/third_party/xxhash/xxhash.c
package/third_party/xxhash/xxhash.h
package/third_party/blake3/c/blake3.c
package/third_party/blake3/c/blake3.h
package/third_party/blake3/c/blake3_dispatch.c
package/third_party/blake3/c/blake3_impl.h
package/third_party/blake3/c/blake3_portable.c
package/third_party/blake3/c/blake3_neon.c
package/third_party/zig-files-hash/build.zig.zon
package/third_party/zig-files-hash/src/zig_files_hash_c_api.h
package/third_party/zig-files-hash-prebuilt/android/arm64-v8a/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/android/armeabi-v7a/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/android/x86/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/android/x86_64/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/Info.plist
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64/libzig_files_hash.a
package/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64_x86_64-simulator/libzig_files_hash.a
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

echo "Verified packaged artifacts in: ${TARBALL}"
