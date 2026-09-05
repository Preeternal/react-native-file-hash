// SwiftPM source shim; the upstream implementation lives in third_party.
// BLAKE3's NEON implementation includes <arm_neon.h>, which is unavailable
// when an iOS Simulator build also targets x86_64. The dispatcher enables this
// object only on AArch64, where BLAKE3_USE_NEON is auto-detected as 1.
#if defined(__aarch64__) || defined(__arm64__) || defined(_M_ARM64) || defined(_M_ARM64EC)
#include "../../../../third_party/blake3/c/blake3_neon.c"
#endif
