#include "jni_utils.h"

#include <limits>

namespace filehash {
namespace jni {

const uint8_t kEmptyByte = 0;

std::string JStringToUtf8(JNIEnv *env, jstring value) {
    if (value == nullptr) {
        return {};
    }

    const char *chars = env->GetStringUTFChars(value, nullptr);
    if (chars == nullptr) {
        return {};
    }

    std::string out(chars);
    env->ReleaseStringUTFChars(value, chars);
    return out;
}

std::vector<uint8_t> JByteArrayToVector(JNIEnv *env, jbyteArray value) {
    return JByteArrayToVector(env, value, std::numeric_limits<size_t>::max());
}

std::vector<uint8_t> JByteArrayToVector(JNIEnv *env, jbyteArray value, size_t max_len) {
    std::vector<uint8_t> out;
    if (value == nullptr) {
        return out;
    }

    const jsize len = env->GetArrayLength(value);
    if (len < 0) {
        return out;
    }

    size_t read_len = static_cast<size_t>(len);
    if (read_len > max_len) {
        read_len = max_len;
    }

    out.resize(read_len);
    if (read_len > 0) {
        env->GetByteArrayRegion(
            value,
            0,
            static_cast<jsize>(read_len),
            reinterpret_cast<jbyte *>(out.data())
        );
    }

    return out;
}

bool ThrowException(JNIEnv *env, const char *class_name, const std::string &message) {
    jclass exception_class = env->FindClass(class_name);
    if (exception_class == nullptr) {
        return false;
    }

    env->ThrowNew(exception_class, message.c_str());
    return true;
}

jbyteArray MakeJavaByteArray(JNIEnv *env, const uint8_t *data, size_t len) {
    const jbyteArray out = env->NewByteArray(static_cast<jsize>(len));
    if (out == nullptr) {
        ThrowException(env, "java/lang/OutOfMemoryError", "Failed to allocate digest buffer");
        return nullptr;
    }

    if (len > 0) {
        env->SetByteArrayRegion(
            out,
            0,
            static_cast<jsize>(len),
            reinterpret_cast<const jbyte *>(data)
        );
    }

    return out;
}

} // namespace jni
} // namespace filehash
