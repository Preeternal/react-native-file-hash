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
    std::vector<uint8_t> *out_digest
);

bool FileHash(
    JNIEnv *env,
    const std::string &algorithm_name,
    const std::string &path,
    bool has_key,
    const std::vector<uint8_t> &key,
    std::vector<uint8_t> *out_digest
);

bool StreamHasherCreate(
    JNIEnv *env,
    const std::string &algorithm_name,
    bool has_key,
    const std::vector<uint8_t> &key,
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

} // namespace zig
} // namespace filehash
