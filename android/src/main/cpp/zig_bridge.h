#pragma once

#include <jni.h>

#include <cstdint>
#include <string>
#include <vector>

namespace filehash {
namespace zig {

jint ApiVersion();

jint ExpectedApiVersion();

bool HasArm64Sha2();

bool StringHash(
    JNIEnv *env,
    const std::string &algorithm_name,
    const std::vector<uint8_t> &data,
    bool has_key,
    const std::vector<uint8_t> &key,
    bool has_seed,
    uint64_t seed,
    const std::string &operation_id,
    std::vector<uint8_t> *out_digest
);

bool FileHashPath(
    JNIEnv *env,
    const std::string &path,
    const std::string &algorithm_name,
    bool has_key,
    const std::vector<uint8_t> &key,
    bool has_seed,
    uint64_t seed,
    bool use_mmap,
    const std::string &operation_id,
    std::vector<uint8_t> *out_digest
);

bool FileHashFd(
    JNIEnv *env,
    int fd,
    const std::string &algorithm_name,
    bool has_key,
    const std::vector<uint8_t> &key,
    bool has_seed,
    uint64_t seed,
    const std::string &operation_id,
    std::vector<uint8_t> *out_digest
);

bool StreamHasherCreate(
    JNIEnv *env,
    const std::string &algorithm_name,
    bool has_key,
    const std::vector<uint8_t> &key,
    bool has_seed,
    uint64_t seed,
    const std::string &operation_id,
    jlong *out_handle
);

bool StreamHasherUpdate(
    JNIEnv *env,
    jlong handle,
    const std::vector<uint8_t> &data
);

bool StreamHasherFinal(
    JNIEnv *env,
    jlong handle,
    std::vector<uint8_t> *out_digest
);

void StreamHasherFree(jlong handle);

void CancelOperation(const std::string &operation_id);

} // namespace zig
} // namespace filehash
