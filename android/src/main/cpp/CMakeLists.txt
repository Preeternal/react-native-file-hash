cmake_minimum_required(VERSION 3.22.1)
project(filehash_native)

set(CMAKE_C_STANDARD 11)
set(FILE_HASH_ENGINE "native" CACHE STRING "Hash engine: native|zig")

include(CheckLinkerFlag)

set(FILEHASH_MAX_PAGE_SIZE_FLAG "-Wl,-z,max-page-size=16384")
check_linker_flag(C "${FILEHASH_MAX_PAGE_SIZE_FLAG}" FILEHASH_LD_SUPPORTS_MAX_PAGE_SIZE)

set(ZIG_API_INCLUDE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/zig-files-hash/src)
set(ZIG_PREBUILT_LIB
  ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/zig-files-hash-prebuilt/android/${ANDROID_ABI}/libzig_files_hash.a
)

if(FILE_HASH_ENGINE STREQUAL "zig")
  if(NOT EXISTS ${ZIG_PREBUILT_LIB})
    message(
      FATAL_ERROR
      "Zig engine selected but prebuilt library is missing: ${ZIG_PREBUILT_LIB}. "
      "Run scripts/build-zig-android.sh first."
    )
  endif()

  set(FILEHASH_SOURCES
    jni_utils.cpp
    error_mapping.cpp
    zig_bridge.cpp
    zig_jni.cpp
  )
else()
  set(BLAKE3_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/blake3/c/blake3.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/blake3/c/blake3_dispatch.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/blake3/c/blake3_portable.c
  )

  set(FILEHASH_SOURCES
    hash_jni.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/xxhash/xxhash.c
    ${BLAKE3_SOURCES}
  )

  # Add NEON implementation on ARM ABIs
  if(${ANDROID_ABI} STREQUAL "arm64-v8a" OR ${ANDROID_ABI} STREQUAL "armeabi-v7a")
    list(APPEND FILEHASH_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/blake3/c/blake3_neon.c)
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
endif()

add_library(
  filehash-native
  SHARED
  ${FILEHASH_SOURCES}
)

if(FILE_HASH_ENGINE STREQUAL "zig")
  target_include_directories(
    filehash-native
    PRIVATE
    ${ZIG_API_INCLUDE_DIR}
  )

  add_library(zig-files-hash STATIC IMPORTED)
  set_target_properties(
    zig-files-hash
    PROPERTIES
    IMPORTED_LOCATION ${ZIG_PREBUILT_LIB}
  )

  target_link_libraries(
    filehash-native
    zig-files-hash
  )
else()
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
endif()

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
