#include "error_mapping.h"

#include <string>

#include "jni_utils.h"

namespace filehash {
namespace zig {

bool ThrowForZfhError(JNIEnv *env, zfh_error code, const char *api_name) {
    const std::string message = std::string(api_name) + " failed: " + zfh_error_message(code);

    switch (code) {
        case ZFH_INVALID_ARGUMENT:
        case ZFH_INVALID_ALGORITHM:
        case ZFH_BUFFER_TOO_SMALL:
        case ZFH_KEY_REQUIRED:
        case ZFH_INVALID_KEY_LENGTH:
        case ZFH_INVALID_PATH:
            return filehash::jni::ThrowException(
                env,
                "java/lang/IllegalArgumentException",
                message
            );
        case ZFH_FILE_NOT_FOUND:
            return filehash::jni::ThrowException(
                env,
                "java/io/FileNotFoundException",
                message
            );
        case ZFH_ACCESS_DENIED:
            return filehash::jni::ThrowException(
                env,
                "java/lang/SecurityException",
                message
            );
        case ZFH_IO_ERROR:
        case ZFH_UNKNOWN_ERROR:
        default:
            return filehash::jni::ThrowException(
                env,
                "java/lang/RuntimeException",
                message
            );
    }
}

} // namespace zig
} // namespace filehash
