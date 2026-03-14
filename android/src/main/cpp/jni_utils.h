#pragma once

#include <jni.h>

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace filehash {
namespace jni {

extern const uint8_t kEmptyByte;

std::string JStringToUtf8(JNIEnv *env, jstring value);

std::vector<uint8_t> JByteArrayToVector(JNIEnv *env, jbyteArray value);

std::vector<uint8_t> JByteArrayToVector(JNIEnv *env, jbyteArray value, size_t max_len);

bool ThrowException(JNIEnv *env, const char *class_name, const std::string &message);

jbyteArray MakeJavaByteArray(JNIEnv *env, const uint8_t *data, size_t len);

} // namespace jni
} // namespace filehash
