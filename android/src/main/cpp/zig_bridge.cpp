#include "zig_bridge.h"

#include <cstddef>
#include <cstdint>
#include <new>
#include <string>
#include <vector>
#if defined(__aarch64__)
#include <asm/hwcap.h>
#include <sys/auxv.h>
#endif

#include "error_mapping.h"
#include "jni_utils.h"
#include "zig_files_hash_c_api.h"

namespace {

struct PreparedRequest {
    zfh_algorithm algorithm = ZFH_ALG_SHA_256;
    zfh_options options{};
    const zfh_options *options_ptr = nullptr;
};

bool ParseAlgorithm(const std::string &algorithm_name, zfh_algorithm *out_algorithm) {
    if (algorithm_name == "SHA-224") {
        *out_algorithm = ZFH_ALG_SHA_224;
        return true;
    }
    if (algorithm_name == "SHA-256") {
        *out_algorithm = ZFH_ALG_SHA_256;
        return true;
    }
    if (algorithm_name == "SHA-384") {
        *out_algorithm = ZFH_ALG_SHA_384;
        return true;
    }
    if (algorithm_name == "SHA-512") {
        *out_algorithm = ZFH_ALG_SHA_512;
        return true;
    }
    if (algorithm_name == "SHA-512/224") {
        *out_algorithm = ZFH_ALG_SHA_512_224;
        return true;
    }
    if (algorithm_name == "SHA-512/256") {
        *out_algorithm = ZFH_ALG_SHA_512_256;
        return true;
    }
    if (algorithm_name == "MD5") {
        *out_algorithm = ZFH_ALG_MD5;
        return true;
    }
    if (algorithm_name == "SHA-1") {
        *out_algorithm = ZFH_ALG_SHA_1;
        return true;
    }
    if (algorithm_name == "XXH3-64") {
        *out_algorithm = ZFH_ALG_XXH3_64;
        return true;
    }
    if (algorithm_name == "BLAKE3") {
        *out_algorithm = ZFH_ALG_BLAKE3;
        return true;
    }
    if (algorithm_name == "HMAC-SHA-224") {
        *out_algorithm = ZFH_ALG_HMAC_SHA_224;
        return true;
    }
    if (algorithm_name == "HMAC-SHA-256") {
        *out_algorithm = ZFH_ALG_HMAC_SHA_256;
        return true;
    }
    if (algorithm_name == "HMAC-SHA-384") {
        *out_algorithm = ZFH_ALG_HMAC_SHA_384;
        return true;
    }
    if (algorithm_name == "HMAC-SHA-512") {
        *out_algorithm = ZFH_ALG_HMAC_SHA_512;
        return true;
    }
    if (algorithm_name == "HMAC-MD5") {
        *out_algorithm = ZFH_ALG_HMAC_MD5;
        return true;
    }
    if (algorithm_name == "HMAC-SHA-1") {
        *out_algorithm = ZFH_ALG_HMAC_SHA_1;
        return true;
    }

    return false;
}

bool IsHmacAlgorithm(zfh_algorithm algorithm) {
    switch (algorithm) {
        case ZFH_ALG_HMAC_SHA_224:
        case ZFH_ALG_HMAC_SHA_256:
        case ZFH_ALG_HMAC_SHA_384:
        case ZFH_ALG_HMAC_SHA_512:
        case ZFH_ALG_HMAC_MD5:
        case ZFH_ALG_HMAC_SHA_1:
            return true;
        default:
            return false;
    }
}

bool ValidateKeyUsage(
    JNIEnv *env,
    zfh_algorithm algorithm,
    bool has_key,
    size_t key_len
) {
    if (IsHmacAlgorithm(algorithm) && !has_key) {
        filehash::jni::ThrowException(
            env,
            "java/lang/IllegalArgumentException",
            "Key is required for HMAC algorithms"
        );
        return false;
    }

    if (algorithm == ZFH_ALG_BLAKE3 && has_key && key_len != 32) {
        filehash::jni::ThrowException(
            env,
            "java/lang/IllegalArgumentException",
            "BLAKE3 keyed mode requires a 32-byte key"
        );
        return false;
    }

    if (!IsHmacAlgorithm(algorithm) && algorithm != ZFH_ALG_BLAKE3 && has_key) {
        filehash::jni::ThrowException(
            env,
            "java/lang/IllegalArgumentException",
            "Key is only used for HMAC algorithms or BLAKE3"
        );
        return false;
    }

    return true;
}

zfh_options BuildOptions(bool has_key, const std::vector<uint8_t> &key_bytes) {
    zfh_options options{};
    options.struct_size = ZFH_OPTIONS_STRUCT_SIZE;
    options.flags = 0;
    options.seed = 0;
    options.key_ptr = nullptr;
    options.key_len = 0;

    if (has_key) {
        options.flags |= ZFH_OPTION_HAS_KEY;
        options.key_ptr = key_bytes.empty() ? &filehash::jni::kEmptyByte : key_bytes.data();
        options.key_len = key_bytes.size();
    }

    return options;
}

bool PrepareRequest(
    JNIEnv *env,
    const std::string &algorithm_name,
    bool has_key,
    const std::vector<uint8_t> &key,
    PreparedRequest *out_request
) {
    if (!ParseAlgorithm(algorithm_name, &out_request->algorithm)) {
        filehash::jni::ThrowException(
            env,
            "java/lang/IllegalArgumentException",
            "Unsupported algorithm: " + algorithm_name
        );
        return false;
    }

    if (!ValidateKeyUsage(env, out_request->algorithm, has_key, key.size())) {
        return false;
    }

    out_request->options = BuildOptions(has_key, key);
    out_request->options_ptr = has_key ? &out_request->options : nullptr;
    return true;
}

bool IsPowerOfTwo(size_t value) {
    return value != 0 && ((value & (value - 1)) == 0);
}

struct ZigStreamState {
    std::vector<uint8_t> storage;
    void *state_ptr = nullptr;
    size_t state_len = 0;
};

bool InitStreamStateInplace(
    zfh_algorithm algorithm,
    const zfh_options *options_ptr,
    ZigStreamState *state,
    zfh_error *out_error
) {
    const size_t required_size = zfh_hasher_state_size();
    const size_t required_align = zfh_hasher_state_align();
    if (required_size == 0 || required_align == 0 || !IsPowerOfTwo(required_align)) {
        *out_error = ZFH_UNKNOWN_ERROR;
        return false;
    }

    const size_t capacity = required_size + required_align - 1;
    state->storage.resize(capacity);

    void *base = state->storage.data();
    const uintptr_t base_addr = reinterpret_cast<uintptr_t>(base);
    const uintptr_t aligned_addr =
        (base_addr + (required_align - 1)) & ~(static_cast<uintptr_t>(required_align - 1));

    state->state_ptr = reinterpret_cast<void *>(aligned_addr);
    state->state_len = capacity - static_cast<size_t>(aligned_addr - base_addr);

    *out_error = zfh_hasher_init_inplace(
        algorithm,
        options_ptr,
        state->state_ptr,
        state->state_len
    );
    return *out_error == ZFH_OK;
}

} // namespace

namespace filehash {
namespace zig {

jint ApiVersion() {
    return static_cast<jint>(zfh_api_version());
}

jint ExpectedApiVersion() {
    return static_cast<jint>(ZFH_API_VERSION);
}

bool HasArm64Sha2() {
#if defined(__aarch64__)
    const unsigned long hwcap = getauxval(AT_HWCAP);
    return (hwcap & HWCAP_SHA2) != 0;
#else
    // SHA2 fallback routing is relevant only for ARM64 targets.
    return true;
#endif
}

bool StringHash(
    JNIEnv *env,
    const std::string &algorithm_name,
    const std::vector<uint8_t> &data,
    bool has_key,
    const std::vector<uint8_t> &key,
    std::vector<uint8_t> *out_digest
) {
    PreparedRequest request{};
    if (!PrepareRequest(env, algorithm_name, has_key, key, &request)) {
        return false;
    }

    std::vector<uint8_t> digest(zfh_max_digest_length());
    size_t written = 0;
    const uint8_t *data_ptr = data.empty() ? &filehash::jni::kEmptyByte : data.data();

    const zfh_error code = zfh_string_hash(
        request.algorithm,
        data_ptr,
        data.size(),
        request.options_ptr,
        digest.data(),
        digest.size(),
        &written
    );
    if (code != ZFH_OK) {
        return ThrowForZfhError(env, code, "zfh_string_hash");
    }

    digest.resize(written);
    *out_digest = std::move(digest);
    return true;
}

bool FileHash(
    JNIEnv *env,
    const std::string &algorithm_name,
    const std::string &path,
    bool has_key,
    const std::vector<uint8_t> &key,
    std::vector<uint8_t> *out_digest
) {
    PreparedRequest request{};
    if (!PrepareRequest(env, algorithm_name, has_key, key, &request)) {
        return false;
    }

    std::vector<uint8_t> digest(zfh_max_digest_length());
    size_t written = 0;
    const uint8_t *path_ptr = path.empty()
        ? &filehash::jni::kEmptyByte
        : reinterpret_cast<const uint8_t *>(path.data());

    const zfh_error code = zfh_file_hash(
        request.algorithm,
        path_ptr,
        path.size(),
        request.options_ptr,
        digest.data(),
        digest.size(),
        &written
    );
    if (code != ZFH_OK) {
        return ThrowForZfhError(env, code, "zfh_file_hash");
    }

    digest.resize(written);
    *out_digest = std::move(digest);
    return true;
}

bool StreamHasherCreate(
    JNIEnv *env,
    const std::string &algorithm_name,
    bool has_key,
    const std::vector<uint8_t> &key,
    jlong *out_handle
) {
    PreparedRequest request{};
    if (!PrepareRequest(env, algorithm_name, has_key, key, &request)) {
        return false;
    }

    auto *state = new (std::nothrow) ZigStreamState();
    if (state == nullptr) {
        filehash::jni::ThrowException(
            env,
            "java/lang/OutOfMemoryError",
            "Failed to allocate stream hasher state"
        );
        return false;
    }

    zfh_error init_error = ZFH_OK;
    if (!InitStreamStateInplace(request.algorithm, request.options_ptr, state, &init_error)) {
        delete state;
        return ThrowForZfhError(env, init_error, "zfh_hasher_init_inplace");
    }

    *out_handle = static_cast<jlong>(reinterpret_cast<intptr_t>(state));
    return true;
}

bool StreamHasherUpdate(
    JNIEnv *env,
    jlong handle,
    const std::vector<uint8_t> &data
) {
    if (handle == 0) {
        filehash::jni::ThrowException(
            env,
            "java/lang/IllegalArgumentException",
            "Invalid stream hasher handle"
        );
        return false;
    }

    auto *state = reinterpret_cast<ZigStreamState *>(static_cast<intptr_t>(handle));
    const uint8_t *data_ptr = data.empty() ? &filehash::jni::kEmptyByte : data.data();

    const zfh_error code = zfh_hasher_update(
        state->state_ptr,
        state->state_len,
        data_ptr,
        data.size()
    );
    if (code != ZFH_OK) {
        return ThrowForZfhError(env, code, "zfh_hasher_update");
    }

    return true;
}

bool StreamHasherFinal(
    JNIEnv *env,
    jlong handle,
    std::vector<uint8_t> *out_digest
) {
    if (handle == 0) {
        filehash::jni::ThrowException(
            env,
            "java/lang/IllegalArgumentException",
            "Invalid stream hasher handle"
        );
        return false;
    }

    auto *state = reinterpret_cast<ZigStreamState *>(static_cast<intptr_t>(handle));
    std::vector<uint8_t> digest(zfh_max_digest_length());
    size_t written = 0;

    const zfh_error code = zfh_hasher_final(
        state->state_ptr,
        state->state_len,
        digest.data(),
        digest.size(),
        &written
    );
    if (code != ZFH_OK) {
        return ThrowForZfhError(env, code, "zfh_hasher_final");
    }

    digest.resize(written);
    *out_digest = std::move(digest);
    return true;
}

void StreamHasherFree(jlong handle) {
    if (handle == 0) {
        return;
    }

    auto *state = reinterpret_cast<ZigStreamState *>(static_cast<intptr_t>(handle));
    delete state;
}

} // namespace zig
} // namespace filehash
