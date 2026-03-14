# Benchmarks

Release measurements for `native` vs `zig` engines.

## Environment

- Android: ARM64 (AArch64), Android 15
- iOS: Apple A15 (arm64), iOS 26.3
- Build: Release
- Values below are medians (`ms`, lower is better)

## Key takeaway

- Main Android bottleneck is SHA-2 in raw generic Zig builds.
- Example: SHA-256 / 200 MiB is `220 ms` (native) vs `12818 ms` (Zig raw).
- Current package routes Android `SHA-224` / `SHA-256` and
  `HMAC-SHA-224` / `HMAC-SHA-256` through native fallback in Zig mode.
- If Zig is built with `-Dcpu=baseline+sha2`, SHA-256 / 200 MiB becomes
  `219 ms` (near native `220 ms`).

### Why keep Zig engine in React Native

- One portable hashing core with a stable C ABI, so behavior does not drift
  between Swift/Kotlin/other bindings as the library grows.
- Faster delivery of new algorithms/features: implement once in Zig core, then
  expose through RN bindings without duplicating full crypto logic per platform.
- Performance hedge instead of lock-in: keep both engines available and select
  the better path per platform/algorithm based on real measurements.
- Current data already shows Zig wins in part of the matrix (for example iOS
  `SHA-256`, `SHA-224`, `HMAC-SHA-256`, `XXH3-64`) while native wins others.
- Android deployment strategy is flexible: current package uses generic Zig +
  native SHA-2 fallback; an alternative is shipping two Zig variants
  (generic and `+sha2`) with runtime routing.

## Quick comparison

### Android

| Scenario | Native | Zig raw (no fallback) | Zig (`-Dcpu=baseline+sha2`) |
|---|---:|---:|---:|
| SHA-256, file 16 MiB | 23 | 1038 | 20 |
| SHA-256, file 200 MiB | 220 | 12818 | 219 |
| SHA-512/224, file 200 MiB | 3490 | 725 | 723 |
| BLAKE3, file 200 MiB | 298 | 555 | 551 |
| XXH3-64, file 200 MiB | 79 | 73 | 76 |

### iOS

| Scenario | Native | Zig |
|---|---:|---:|
| SHA-256, file 16 MiB | 31 | 29 |
| SHA-256, file 200 MiB | 262 | 221 |
| BLAKE3, file 200 MiB | 339 | 728 |
| XXH3-64, file 200 MiB | 120 | 81 |

## Full matrix: Android 200 MiB

| Algorithm | Native | Zig raw (no fallback) | Zig (`-Dcpu=baseline+sha2`) |
|---|---:|---:|---:|
| SHA-256 | 220 | 12818 | 219 |
| MD5 | 561 | 536 | 523 |
| SHA-1 | 221 | 509 | 501 |
| SHA-224 | 215 | 12785 | 218 |
| SHA-384 | 538 | 723 | 723 |
| SHA-512 | 543 | 724 | 736 |
| SHA-512/224 | 3490 | 725 | 723 |
| SHA-512/256 | 3484 | 724 | 720 |
| HMAC-SHA-224 | 233 | 12803 | 218 |
| HMAC-SHA-256 | 227 | 12764 | 221 |
| HMAC-SHA-384 | 549 | 728 | 725 |
| HMAC-SHA-512 | 540 | 728 | 723 |
| HMAC-MD5 | 566 | 537 | 526 |
| HMAC-SHA-1 | 223 | 508 | 501 |
| BLAKE3 | 298 | 555 | 551 |
| XXH3-64 | 79 | 73 | 76 |

## Full matrix: iOS 200 MiB

| Algorithm | Native | Zig |
|---|---:|---:|
| SHA-256 | 262 | 221 |
| MD5 | 627 | 607 |
| SHA-1 | 258 | 602 |
| SHA-224 | 265 | 240 |
| SHA-384 | 344 | 1236 |
| SHA-512 | 354 | 1239 |
| SHA-512/224 | 343 | 1236 |
| SHA-512/256 | 343 | 1236 |
| HMAC-SHA-224 | 260 | 255 |
| HMAC-SHA-256 | 258 | 253 |
| HMAC-SHA-384 | 342 | 1240 |
| HMAC-SHA-512 | 343 | 1246 |
| HMAC-MD5 | 621 | 616 |
| HMAC-SHA-1 | 256 | 601 |
| BLAKE3 | 339 | 728 |
| XXH3-64 | 120 | 81 |

## Size impact

- Android APK: `+0.49%` (`+81,920` bytes) with Zig engine prebuilts
- Android AAB: `+0.42%` (`+51,551` bytes)
- iOS app dir: `-0.20%` (`-60 KiB`)
- iOS main binary: `-0.30%` (`-61,952` bytes)

## Notes

- `Zig raw (no fallback)` shows pure Zig-path timing without Android runtime
  fallback and without target-specific CPU features.
- In real app flow with current Android fallback, `SHA-224` / `SHA-256` and
  matching HMAC variants run through native, so expected latency there is near
  the `Native` column, not `Zig raw`.
- `XXH3-128` is native-only and not included in Zig comparisons.
