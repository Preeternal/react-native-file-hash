# Benchmarks

Release measurements for `native` vs `zig` engines on mobile, plus Zig-only
desktop snapshots for experimental macOS and Windows support.

## Environment

- Android: physical ARM64 device, Android 15
- iOS: physical Apple A15 device, iOS 26.3
- macOS: Apple MacBook Pro 16-inch, M4 Max, 36 GB RAM
- Windows: QEMU 10.0 ARM Virtual Machine, ARM64, 8 GB RAM
- Build: Release
- Payload: generated local cache file, 200 MiB
- App settings: `samples=3`, `warmups=1`
- Values below are medians (`ms`, lower is better)

Each run reports the app-level median for three measured samples. When repeated
runs are available, comparison tables use the median across those runs.

This document is a current engine-selection snapshot, not a release-to-release
speedup table. A slower row means "slower than `native` on that platform"; it
does not by itself mean the Zig core regressed versus the previous release.

Desktop rows are Zig-only because macOS and Windows support currently ships the
Zig engine only. The Windows numbers were captured in an ARM64 VM, so they are
useful as a release smoke/performance snapshot, not as a hardware comparison
against physical devices.

## Key Takeaways

- Zig `v0.0.5` improves the Zig path versus the previous benchmark set for
  visible cases such as `BLAKE3` and iOS `XXH3-64`. Release-to-release notes
  live in `CHANGELOG.md`.
- Current iOS `zig` is faster than `native` for `SHA-256`, `SHA-224`,
  `HMAC-SHA-224`, `HMAC-SHA-256`, `BLAKE3`, and `XXH3-64`.
- Current iOS `native` remains the better choice for `SHA-1` and the `SHA-384` /
  `SHA-512` family.
- Zig `mmap` remains opt-in because measurements vary by workload; benchmark
  the target device, file size, storage, and algorithm before enabling it.
- Android `zig` is close to `native` for `SHA-224`, `SHA-256`,
  `HMAC-SHA-224`, and `HMAC-SHA-256` because the shipped Zig runtime routes
  those algorithms through the native fallback.
- Android `zig` is substantially faster for `SHA-512/224` and
  `SHA-512/256`, where the native implementation is much slower.
- Android `native` is faster for `SHA-1`, `SHA-384`, `SHA-512`, `BLAKE3`,
  and `XXH3-64` in this measurement set.
- Experimental macOS and Windows support produce matching digest prefixes for
  the same 200 MiB benchmark payload.
- macOS on M4 Max is currently the fastest measured Zig desktop target, with
  `XXH3-64` at 14 ms and `SHA-256` / `SHA-224` / HMAC-SHA-2 224/256 around
  78-79 ms.
- Windows ARM64 VM performs well for `BLAKE3`, `XXH3-64`, `SHA-1`, and the
  SHA-512 family, but is much slower than macOS for SHA-224/SHA-256 and their
  HMAC variants in this run.

## Quick Comparison

### iOS

| Scenario              | Native |  Zig | Zig vs native |
| --------------------- | -----: | ---: | ------------: |
| SHA-256, file 200 MiB |    228 |  209 |     9% faster |
| SHA-512, file 200 MiB |    317 | 1176 |   271% slower |
| BLAKE3, file 200 MiB  |    310 |  302 |     3% faster |
| XXH3-64, file 200 MiB |    108 |   66 |    39% faster |

### Android

| Scenario                  | Native | Zig | Zig vs native |
| ------------------------- | -----: | --: | ------------: |
| SHA-256, file 200 MiB     |    297 | 332 |    12% slower |
| SHA-512/224, file 200 MiB |   3832 | 796 |    79% faster |
| BLAKE3, file 200 MiB      |    304 | 391 |    29% slower |
| XXH3-64, file 200 MiB     |     73 |  96 |    32% slower |

### Desktop Zig

| Scenario              | macOS M4 Max | Windows ARM64 VM |
| --------------------- | -----------: | ---------------: |
| SHA-256, file 200 MiB |         79.0 |              539 |
| SHA-512, file 200 MiB |          295 |              332 |
| BLAKE3, file 200 MiB  |          102 |              125 |
| XXH3-64, file 200 MiB |         14.0 |             28.0 |

## Full Matrix: iOS 200 MiB

| Algorithm    | Native |  Zig | Zig vs native |
| ------------ | -----: | ---: | ------------: |
| SHA-256      |    228 |  209 |     9% faster |
| MD5          |    587 |  561 |     5% faster |
| SHA-1        |    222 |  552 |   149% slower |
| SHA-224      |    227 |  207 |     9% faster |
| SHA-384      |    316 | 1177 |   272% slower |
| SHA-512      |    317 | 1176 |   271% slower |
| SHA-512/224  |    315 | 1175 |   273% slower |
| SHA-512/256  |    313 | 1173 |   275% slower |
| HMAC-SHA-224 |    223 |  204 |     9% faster |
| HMAC-SHA-256 |    223 |  207 |     7% faster |
| HMAC-SHA-384 |    315 | 1173 |   272% slower |
| HMAC-SHA-512 |    314 | 1174 |   274% slower |
| HMAC-MD5     |    586 |  556 |     5% faster |
| HMAC-SHA-1   |    214 |  549 |   157% slower |
| BLAKE3       |    310 |  302 |     3% faster |
| XXH3-64      |    108 |   66 |    39% faster |

## Full Matrix: Android 200 MiB

| Algorithm    | Native | Zig | Zig vs native |
| ------------ | -----: | --: | ------------: |
| SHA-256      |    297 | 332 |    12% slower |
| MD5          |    585 | 605 |     3% slower |
| SHA-1        |    228 | 581 |   155% slower |
| SHA-224      |    222 | 227 |     2% slower |
| SHA-384      |    552 | 818 |    48% slower |
| SHA-512      |    549 | 808 |    47% slower |
| SHA-512/224  |   3832 | 796 |    79% faster |
| SHA-512/256  |   3868 | 795 |    79% faster |
| HMAC-SHA-224 |    222 | 227 |     2% slower |
| HMAC-SHA-256 |    222 | 225 |     1% slower |
| HMAC-SHA-384 |    553 | 792 |    43% slower |
| HMAC-SHA-512 |    553 | 797 |    44% slower |
| HMAC-MD5     |    581 | 588 |     1% slower |
| HMAC-SHA-1   |    229 | 557 |   143% slower |
| BLAKE3       |    304 | 391 |    29% slower |
| XXH3-64      |     73 |  96 |    32% slower |

## Full Matrix: Desktop Zig 200 MiB

| Algorithm    | macOS M4 Max | macOS range | macOS mmap | macOS mmap range | mmap vs macOS Zig | Windows ARM64 VM | Windows range |
| ------------ | -----------: | ----------: | ---------: | ---------------: | ----------------: | ---------------: | ------------: |
| SHA-256      |         79.0 |   79.0-79.0 |       75.0 |        75.0-75.0 |         5% faster |              539 |       516-636 |
| MD5          |          238 |     238-239 |        237 |          234-238 |              flat |              285 |       269-289 |
| SHA-1        |          171 |     169-171 |        165 |          165-166 |         4% faster |              201 |       198-205 |
| SHA-224      |         79.0 |   78.0-79.0 |       74.0 |        74.0-75.0 |         6% faster |              496 |       496-504 |
| SHA-384      |          295 |     293-295 |        287 |          284-293 |         3% faster |              335 |       333-362 |
| SHA-512      |          295 |     293-296 |        274 |          273-277 |         7% faster |              332 |       331-337 |
| SHA-512/224  |          296 |     295-296 |        283 |          282-285 |         4% faster |              347 |       329-365 |
| SHA-512/256  |          296 |     295-297 |        284 |          284-285 |         4% faster |              349 |       340-525 |
| HMAC-SHA-224 |         78.0 |   78.0-79.0 |       74.0 |        74.0-75.0 |         5% faster |              502 |       493-515 |
| HMAC-SHA-256 |         78.0 |   78.0-78.0 |       74.0 |        74.0-75.0 |         5% faster |              505 |       503-508 |
| HMAC-SHA-384 |          297 |     293-299 |        284 |          282-286 |         4% faster |              349 |       340-374 |
| HMAC-SHA-512 |          297 |     295-298 |        282 |          280-283 |         5% faster |              338 |       332-339 |
| HMAC-MD5     |          239 |     238-246 |        234 |          234-235 |         2% faster |              269 |       266-269 |
| HMAC-SHA-1   |          172 |     172-172 |        166 |          166-167 |         3% faster |              202 |       200-203 |
| BLAKE3       |          102 |     102-103 |        102 |          102-103 |              flat |              125 |       125-126 |
| XXH3-64      |         14.0 |   14.0-15.0 |       15.0 |        15.0-15.0 |         7% slower |             28.0 |     28.0-30.0 |

## mmap observations (zig engine only)

Local mmap measurements varied by workload. In separate 200 MiB release-build
client comparisons, results ranged from mixed low-single-digit changes to all
recorded medians being roughly 2-11% faster. Direct Zig-core measurements on a
500 MiB file showed up to roughly 20% improvement for some algorithms.

mmap remains disabled by default; benchmark the target device, file size,
storage, and algorithm before enabling it.

## Notes

- Android `zig` currently uses native fallback for `SHA-224`, `SHA-256`,
  `HMAC-SHA-224`, and `HMAC-SHA-256` in the shipped generic prebuilt setup.
- `XXH3-128` is native-only and is not included in Zig comparisons.
- Simulator, emulator, and Debug measurements are useful for smoke-checking the
  benchmark flow, but they run under different CPU, filesystem, and build
  conditions. Use physical devices and Release builds for performance claims.
