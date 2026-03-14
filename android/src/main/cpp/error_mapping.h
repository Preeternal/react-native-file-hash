#pragma once

#include <jni.h>

#include "zig_files_hash_c_api.h"

namespace filehash {
namespace zig {

bool ThrowForZfhError(JNIEnv *env, zfh_error code, const char *api_name);

} // namespace zig
} // namespace filehash
