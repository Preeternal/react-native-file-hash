#include "zig_bridge.h"

#include <cstddef>
#include <cstdint>
#include <mutex>
#include <new>
#include <string>
#include <unordered_map>
#include <unordered_set>
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
    bool has_options = false;
};

struct ZigOperationState {
    std::vector<uint8_t> storage;
    void *state_ptr = nullptr;
    size_t state_len = 0;
};

std::mutex g_operation_mutex;
std::unordered_map<std::string, ZigOperationState *> g_operations;
std::unordered_set<std::string> g_cancelled_operation_ids;

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
    size_t key_len,
    bool has_seed
) {
    if (has_seed && algorithm != ZFH_ALG_XXH3_64) {
        filehash::jni::ThrowException(
            env,
            "java/lang/IllegalArgumentException",
            "Seed is only used for XXH3-64 and XXH3-128"
        );
        return false;
    }

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

zfh_options BuildOptions(
    bool has_key,
    const std::vector<uint8_t> &key_bytes,
    bool has_seed,
    uint64_t seed,
    bool use_mmap
) {
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

    if (has_seed) {
        options.flags |= ZFH_OPTION_HAS_SEED;
        options.seed = seed;
    }

    if (use_mmap) {
        options.flags |= ZFH_OPTION_USE_MMAP;
    }

    return options;
}

bool PrepareRequest(
    JNIEnv *env,
    const std::string &algorithm_name,
    bool has_key,
    const std::vector<uint8_t> &key,
    bool has_seed,
    uint64_t seed,
    bool use_mmap,
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

    if (!ValidateKeyUsage(
            env,
            out_request->algorithm,
            has_key,
            key.size(),
            has_seed
        )) {
        return false;
    }

    out_request->options = BuildOptions(has_key, key, has_seed, seed, use_mmap);
    out_request->has_options = has_key || has_seed || use_mmap;
    return true;
}

bool IsPowerOfTwo(size_t value) {
    return value != 0 && ((value & (value - 1)) == 0);
}

bool InitAlignedStorage(
    size_t required_size,
    size_t required_align,
    std::vector<uint8_t> *storage,
    void **out_ptr,
    size_t *out_len
) {
    if (required_size == 0 || required_align == 0 || !IsPowerOfTwo(required_align)) {
        return false;
    }

    const size_t capacity = required_size + required_align - 1;
    storage->resize(capacity);

    void *base = storage->data();
    const uintptr_t base_addr = reinterpret_cast<uintptr_t>(base);
    const uintptr_t aligned_addr =
        (base_addr + (required_align - 1)) & ~(static_cast<uintptr_t>(required_align - 1));

    *out_ptr = reinterpret_cast<void *>(aligned_addr);
    *out_len = capacity - static_cast<size_t>(aligned_addr - base_addr);
    return true;
}

bool InitOperationState(ZigOperationState *operation, zfh_error *out_error) {
    if (!InitAlignedStorage(
            zfh_operation_state_size(),
            zfh_operation_state_align(),
            &operation->storage,
            &operation->state_ptr,
            &operation->state_len
        )) {
        *out_error = ZFH_UNKNOWN_ERROR;
        return false;
    }

    *out_error = zfh_operation_init_inplace(operation->state_ptr, operation->state_len);
    return *out_error == ZFH_OK;
}

void RegisterOperation(const std::string &operation_id, ZigOperationState *operation) {
    if (operation_id.empty() || operation == nullptr) {
        return;
    }

    std::lock_guard<std::mutex> lock(g_operation_mutex);
    g_operations[operation_id] = operation;
    if (g_cancelled_operation_ids.erase(operation_id) > 0) {
        (void)zfh_operation_cancel(operation->state_ptr, operation->state_len);
    }
}

void UnregisterOperation(const std::string &operation_id, ZigOperationState *operation) {
    if (operation_id.empty()) {
        return;
    }

    std::lock_guard<std::mutex> lock(g_operation_mutex);
    const auto it = g_operations.find(operation_id);
    if (it != g_operations.end() && it->second == operation) {
        g_operations.erase(it);
    }
    g_cancelled_operation_ids.erase(operation_id);
}

void CancelOperationById(const std::string &operation_id) {
    if (operation_id.empty()) {
        return;
    }

    std::lock_guard<std::mutex> lock(g_operation_mutex);
    const auto it = g_operations.find(operation_id);
    if (it == g_operations.end()) {
        g_cancelled_operation_ids.insert(operation_id);
        return;
    }

    ZigOperationState *operation = it->second;
    if (operation != nullptr) {
        (void)zfh_operation_cancel(operation->state_ptr, operation->state_len);
    }
}

zfh_request BuildZfhRequest(
    const PreparedRequest &prepared,
    ZigOperationState *operation
) {
    zfh_request request{};
    request.struct_size = ZFH_REQUEST_STRUCT_SIZE;
    request.options_ptr = prepared.has_options ? &prepared.options : nullptr;
    if (operation != nullptr) {
        request.operation_ptr = operation->state_ptr;
        request.operation_len = operation->state_len;
    }
    return request;
}

struct ZigStreamState {
    std::vector<uint8_t> storage;
    void *state_ptr = nullptr;
    size_t state_len = 0;
    ZigOperationState operation;
    bool has_operation = false;
    std::string operation_id;
};

bool InitStreamStateInplace(
    zfh_algorithm algorithm,
    const PreparedRequest &prepared,
    const std::string &operation_id,
    ZigStreamState *state,
    zfh_error *out_error
) {
    if (!operation_id.empty()) {
        if (!InitOperationState(&state->operation, out_error)) {
            return false;
        }
        state->has_operation = true;
        state->operation_id = operation_id;
        RegisterOperation(operation_id, &state->operation);
    }

    if (!InitAlignedStorage(
            zfh_hasher_state_size(),
            zfh_hasher_state_align(),
            &state->storage,
            &state->state_ptr,
            &state->state_len
        )) {
        *out_error = ZFH_UNKNOWN_ERROR;
        if (state->has_operation) {
            UnregisterOperation(state->operation_id, &state->operation);
            state->has_operation = false;
        }
        return false;
    }

    zfh_request request = BuildZfhRequest(prepared, state->has_operation ? &state->operation : nullptr);
    const zfh_request *request_ptr =
        (prepared.has_options || state->has_operation) ? &request : nullptr;

    *out_error = zfh_hasher_init_inplace(
        algorithm,
        request_ptr,
        state->state_ptr,
        state->state_len
    );
    if (*out_error != ZFH_OK && state->has_operation) {
        UnregisterOperation(state->operation_id, &state->operation);
        state->has_operation = false;
    }
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
    bool has_seed,
    uint64_t seed,
    const std::string &operation_id,
    std::vector<uint8_t> *out_digest
) {
    PreparedRequest request{};
    if (!PrepareRequest(env, algorithm_name, has_key, key, has_seed, seed, false, &request)) {
        return false;
    }

    ZigOperationState operation{};
    ZigOperationState *operation_ptr = nullptr;
    if (!operation_id.empty()) {
        zfh_error operation_error = ZFH_OK;
        if (!InitOperationState(&operation, &operation_error)) {
            return ThrowForZfhError(env, operation_error, "zfh_operation_init_inplace");
        }
        operation_ptr = &operation;
        RegisterOperation(operation_id, operation_ptr);
    }

    std::vector<uint8_t> digest(zfh_max_digest_length());
    size_t written = 0;
    const uint8_t *data_ptr = data.empty() ? &filehash::jni::kEmptyByte : data.data();
    zfh_request zfh_request_value = BuildZfhRequest(request, operation_ptr);
    const zfh_request *request_ptr =
        (request.has_options || operation_ptr != nullptr) ? &zfh_request_value : nullptr;

    const zfh_error code = zfh_string_hash(
        request.algorithm,
        data_ptr,
        data.size(),
        request_ptr,
        digest.data(),
        digest.size(),
        &written
    );
    if (operation_ptr != nullptr) {
        UnregisterOperation(operation_id, operation_ptr);
    }
    if (code != ZFH_OK) {
        return ThrowForZfhError(env, code, "zfh_string_hash");
    }

    digest.resize(written);
    *out_digest = std::move(digest);
    return true;
}

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
) {
    PreparedRequest request{};
    if (!PrepareRequest(env, algorithm_name, has_key, key, has_seed, seed, use_mmap, &request)) {
        return false;
    }

    ZigOperationState operation{};
    ZigOperationState *operation_ptr = nullptr;
    if (!operation_id.empty()) {
        zfh_error operation_error = ZFH_OK;
        if (!InitOperationState(&operation, &operation_error)) {
            return ThrowForZfhError(env, operation_error, "zfh_operation_init_inplace");
        }
        operation_ptr = &operation;
        RegisterOperation(operation_id, operation_ptr);
    }

    zfh_context *context = nullptr;
    zfh_error code = zfh_context_create(&context);
    if (code != ZFH_OK) {
        if (operation_ptr != nullptr) {
            UnregisterOperation(operation_id, operation_ptr);
        }
        return ThrowForZfhError(env, code, "zfh_context_create");
    }

    std::vector<uint8_t> digest(zfh_max_digest_length());
    size_t written = 0;
    const uint8_t *path_ptr =
        path.empty() ? &filehash::jni::kEmptyByte : reinterpret_cast<const uint8_t *>(path.data());
    zfh_request zfh_request_value = BuildZfhRequest(request, operation_ptr);
    const zfh_request *request_ptr =
        (request.has_options || operation_ptr != nullptr) ? &zfh_request_value : nullptr;

    code = zfh_context_file_hash(
        context,
        request.algorithm,
        path_ptr,
        path.size(),
        request_ptr,
        digest.data(),
        digest.size(),
        &written
    );
    const zfh_error destroy_code = zfh_context_destroy(context);
    if (operation_ptr != nullptr) {
        UnregisterOperation(operation_id, operation_ptr);
    }
    if (code != ZFH_OK) {
        return ThrowForZfhError(env, code, "zfh_context_file_hash");
    }
    if (destroy_code != ZFH_OK) {
        return ThrowForZfhError(env, destroy_code, "zfh_context_destroy");
    }

    digest.resize(written);
    *out_digest = std::move(digest);
    return true;
}

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
) {
    PreparedRequest request{};
    if (!PrepareRequest(env, algorithm_name, has_key, key, has_seed, seed, false, &request)) {
        return false;
    }

    ZigOperationState operation{};
    ZigOperationState *operation_ptr = nullptr;
    if (!operation_id.empty()) {
        zfh_error operation_error = ZFH_OK;
        if (!InitOperationState(&operation, &operation_error)) {
            return ThrowForZfhError(env, operation_error, "zfh_operation_init_inplace");
        }
        operation_ptr = &operation;
        RegisterOperation(operation_id, operation_ptr);
    }

    std::vector<uint8_t> digest(zfh_max_digest_length());
    size_t written = 0;
    zfh_request zfh_request_value = BuildZfhRequest(request, operation_ptr);
    const zfh_request *request_ptr =
        (request.has_options || operation_ptr != nullptr) ? &zfh_request_value : nullptr;

    const zfh_error code = zfh_fd_hash(
        request.algorithm,
        fd,
        request_ptr,
        digest.data(),
        digest.size(),
        &written
    );
    if (operation_ptr != nullptr) {
        UnregisterOperation(operation_id, operation_ptr);
    }
    if (code != ZFH_OK) {
        return ThrowForZfhError(env, code, "zfh_fd_hash");
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
    bool has_seed,
    uint64_t seed,
    const std::string &operation_id,
    jlong *out_handle
) {
    PreparedRequest request{};
    if (!PrepareRequest(env, algorithm_name, has_key, key, has_seed, seed, false, &request)) {
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
    if (!InitStreamStateInplace(request.algorithm, request, operation_id, state, &init_error)) {
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
    if (state->has_operation) {
        UnregisterOperation(state->operation_id, &state->operation);
    }
    delete state;
}

void CancelOperation(const std::string &operation_id) {
    CancelOperationById(operation_id);
}

} // namespace zig
} // namespace filehash
