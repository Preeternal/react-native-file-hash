#!/usr/bin/env bash
set -euo pipefail

readelf_cmd=""
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  if command -v llvm-readelf >/dev/null 2>&1; then
    readelf_cmd="llvm-readelf"
  elif command -v readelf >/dev/null 2>&1; then
    readelf_cmd="readelf"
  elif command -v greadelf >/dev/null 2>&1; then
    readelf_cmd="greadelf"
  fi
else
  find_readelf() {
    local candidates=(
      llvm-readelf
      readelf
      greadelf
      /opt/homebrew/opt/llvm/bin/llvm-readelf
      /usr/local/opt/llvm/bin/llvm-readelf
      /opt/homebrew/bin/greadelf
      /usr/local/bin/greadelf
    )
    for candidate in "${candidates[@]}"; do
      if command -v "$candidate" >/dev/null 2>&1; then
        echo "$candidate"
        return 0
      fi
      if [ -x "$candidate" ]; then
        echo "$candidate"
        return 0
      fi
    done
    return 1
  }
  readelf_cmd="$(find_readelf || true)"
fi
if [ -z "$readelf_cmd" ]; then
  echo "ERROR: neither llvm-readelf, readelf, nor greadelf found in PATH" >&2
  if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
    echo "Tip: brew install llvm (llvm-readelf) or binutils (greadelf), or export PATH to include them." >&2
  fi
  exit 1
fi

readelf_args=(-l -W)
files=()
if command -v rg >/dev/null 2>&1; then
  rg_load_align() { rg -n "LOAD|Align"; }
  while IFS= read -r line; do
    [ -n "$line" ] && files+=("$line")
  done < <(rg --files -g "libfilehash-native.so" android/build example/android/build || true)
else
  rg_load_align() { grep -n -E "LOAD|Align"; }
  while IFS= read -r line; do
    [ -n "$line" ] && files+=("$line")
  done < <(find android/build example/android/build -name "libfilehash-native.so" 2>/dev/null || true)
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "ERROR: no libfilehash-native.so found; build Android first" >&2
  exit 1
fi

for so in "${files[@]}"; do
  if ! "$readelf_cmd" "${readelf_args[@]}" "$so" | awk '
    $1=="LOAD" { load=1; if ($NF!="0x4000") bad=1 }
    END { if (!load) exit 2; exit bad }
  '; then
    status=$?
    if [ "$status" -eq 2 ]; then
      echo "ERROR: no LOAD segments found for $so" >&2
    else
      echo "ERROR: expected 16KB alignment (0x4000) for $so" >&2
    fi
    "$readelf_cmd" "${readelf_args[@]}" "$so" | rg_load_align || true
    exit 1
  fi
done

echo "OK: 16KB alignment verified"
