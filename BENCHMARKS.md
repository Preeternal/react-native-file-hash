# Benchmarks

Release measurements for `native` vs `zig` engines.

## Environment

- Android: physical ARM64 device, Android 15
- iOS: physical Apple A15 device, iOS 26.3
- Build: Release
- Payload: generated local cache file, 200 MiB
- App settings: `samples=3`, `warmups=1`
- Values below are medians (`ms`, lower is better)

Each run reports the app-level median for three measured samples. The tables
below use the median across repeated runs.

This document is a current engine-selection snapshot, not a release-to-release
speedup table. A slower row means "slower than `native` on that platform"; it
does not by itself mean the Zig core regressed versus the previous release.

## Key Takeaways

- Zig `v0.0.5` improves the Zig path versus the previous benchmark set for
  visible cases such as `BLAKE3` and iOS `XXH3-64`. Release-to-release notes
  live in `CHANGELOG.md`.
- Current iOS `zig` is faster than `native` for `SHA-256`, `SHA-224`,
  `HMAC-SHA-224`, `HMAC-SHA-256`, `BLAKE3`, and `XXH3-64`.
- Current iOS `native` remains the better choice for `SHA-1` and the `SHA-384` /
  `SHA-512` family.
- Android `zig` is close to `native` for `SHA-224`, `SHA-256`,
  `HMAC-SHA-224`, and `HMAC-SHA-256` because the shipped Zig runtime routes
  those algorithms through the native fallback.
- Android `zig` is substantially faster for `SHA-512/224` and
  `SHA-512/256`, where the native implementation is much slower.
- Android `native` is faster for `SHA-1`, `SHA-384`, `SHA-512`, `BLAKE3`,
  and `XXH3-64` in this measurement set.

## Quick Comparison

### iOS

| Scenario | Native | Zig | Zig vs native |
|---|---:|---:|---:|
| SHA-256, file 200 MiB | 228 | 209 | 9% faster |
| SHA-512, file 200 MiB | 317 | 1176 | 271% slower |
| BLAKE3, file 200 MiB | 310 | 302 | 3% faster |
| XXH3-64, file 200 MiB | 108 | 66 | 39% faster |

### Android

| Scenario | Native | Zig | Zig vs native |
|---|---:|---:|---:|
| SHA-256, file 200 MiB | 297 | 332 | 12% slower |
| SHA-512/224, file 200 MiB | 3832 | 796 | 79% faster |
| BLAKE3, file 200 MiB | 304 | 391 | 29% slower |
| XXH3-64, file 200 MiB | 73 | 96 | 32% slower |

## Full Matrix: iOS 200 MiB

| Algorithm | Native | Zig | Zig vs native |
|---|---:|---:|---:|
| SHA-256 | 228 | 209 | 9% faster |
| MD5 | 587 | 561 | 5% faster |
| SHA-1 | 222 | 552 | 149% slower |
| SHA-224 | 227 | 207 | 9% faster |
| SHA-384 | 316 | 1177 | 272% slower |
| SHA-512 | 317 | 1176 | 271% slower |
| SHA-512/224 | 315 | 1175 | 273% slower |
| SHA-512/256 | 313 | 1173 | 275% slower |
| HMAC-SHA-224 | 223 | 204 | 9% faster |
| HMAC-SHA-256 | 223 | 207 | 7% faster |
| HMAC-SHA-384 | 315 | 1173 | 272% slower |
| HMAC-SHA-512 | 314 | 1174 | 274% slower |
| HMAC-MD5 | 586 | 556 | 5% faster |
| HMAC-SHA-1 | 214 | 549 | 157% slower |
| BLAKE3 | 310 | 302 | 3% faster |
| XXH3-64 | 108 | 66 | 39% faster |

## Full Matrix: Android 200 MiB

| Algorithm | Native | Zig | Zig vs native |
|---|---:|---:|---:|
| SHA-256 | 297 | 332 | 12% slower |
| MD5 | 585 | 605 | 3% slower |
| SHA-1 | 228 | 581 | 155% slower |
| SHA-224 | 222 | 227 | 2% slower |
| SHA-384 | 552 | 818 | 48% slower |
| SHA-512 | 549 | 808 | 47% slower |
| SHA-512/224 | 3832 | 796 | 79% faster |
| SHA-512/256 | 3868 | 795 | 79% faster |
| HMAC-SHA-224 | 222 | 227 | 2% slower |
| HMAC-SHA-256 | 222 | 225 | 1% slower |
| HMAC-SHA-384 | 553 | 792 | 43% slower |
| HMAC-SHA-512 | 553 | 797 | 44% slower |
| HMAC-MD5 | 581 | 588 | 1% slower |
| HMAC-SHA-1 | 229 | 557 | 143% slower |
| BLAKE3 | 304 | 391 | 29% slower |
| XXH3-64 | 73 | 96 | 32% slower |

## Notes

- Android `zig` currently uses native fallback for `SHA-224`, `SHA-256`,
  `HMAC-SHA-224`, and `HMAC-SHA-256` in the shipped generic prebuilt setup.
- `XXH3-128` is native-only and is not included in Zig comparisons.
- Simulator, emulator, and Debug measurements are useful for smoke-checking the
  benchmark flow, but they run under different CPU, filesystem, and build
  conditions. Use physical devices and Release builds for performance claims.
