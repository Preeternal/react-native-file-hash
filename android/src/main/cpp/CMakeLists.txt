cmake_minimum_required(VERSION 3.22.1)
project(filehash_native)

set(CMAKE_C_STANDARD 11)

include(CheckLinkerFlag)

set(FILEHASH_MAX_PAGE_SIZE_FLAG "-Wl,-z,max-page-size=16384")
check_linker_flag(C "${FILEHASH_MAX_PAGE_SIZE_FLAG}" FILEHASH_LD_SUPPORTS_MAX_PAGE_SIZE)

set(BLAKE3_SOURCES
  ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/blake3/c/blake3.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/blake3/c/blake3_dispatch.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/blake3/c/blake3_portable.c
)

# Add NEON implementation on ARM ABIs
if(${ANDROID_ABI} STREQUAL "arm64-v8a" OR ${ANDROID_ABI} STREQUAL "armeabi-v7a")
  list(APPEND BLAKE3_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/blake3/c/blake3_neon.c)
  set(BLAKE3_DEFS
    BLAKE3_USE_NEON=1
    BLAKE3_NO_AVX2=1
    BLAKE3_NO_AVX512=1
    BLAKE3_NO_SSE2=1
    BLAKE3_NO_SSE41=1
  )
else()
  set(BLAKE3_DEFS
    BLAKE3_NO_SIMD=1
    BLAKE3_NO_SSE2=1
    BLAKE3_NO_SSE41=1
    BLAKE3_NO_AVX2=1
    BLAKE3_NO_AVX512=1
  )
endif()

add_library(
  filehash-native
  SHARED
  hash_jni.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/xxhash/xxhash.c
  ${BLAKE3_SOURCES}
)

target_include_directories(
  filehash-native
  PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/xxhash
  ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/blake3/c
)

target_compile_definitions(
  filehash-native
  PRIVATE
  ${BLAKE3_DEFS}
)

find_library(log-lib log)

target_link_libraries(
  filehash-native
  ${log-lib}
)

if(FILEHASH_LD_SUPPORTS_MAX_PAGE_SIZE)
  target_link_options(
    filehash-native
    PRIVATE
    "${FILEHASH_MAX_PAGE_SIZE_FLAG}"
  )
else()
  message(STATUS "filehash-native: linker does not support ${FILEHASH_MAX_PAGE_SIZE_FLAG}; building without 16KB alignment")
endif()
