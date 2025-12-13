#include <jni.h>
#include <cstdint>
#include <cstring>
#include "xxhash.h"
#include "blake3.h"

extern "C" JNIEXPORT jlong JNICALL
Java_com_preeternal_filehash_NativeHasher_xxh3Init64(JNIEnv *, jobject) {
    XXH3_state_t *state = XXH3_createState();
    if (state == nullptr) {
        return 0;
    }
    XXH3_64bits_reset(state);
    return reinterpret_cast<jlong>(state);
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_preeternal_filehash_NativeHasher_xxh3Init128(JNIEnv *, jobject) {
    XXH3_state_t *state = XXH3_createState();
    if (state == nullptr) {
        return 0;
    }
    XXH3_128bits_reset(state);
    return reinterpret_cast<jlong>(state);
}

extern "C" JNIEXPORT void JNICALL
Java_com_preeternal_filehash_NativeHasher_xxh3Update64(JNIEnv *env, jobject, jlong ptr, jbyteArray data, jint length) {
    if (ptr == 0 || length <= 0) {
        return;
    }
    jbyte *bytes = env->GetByteArrayElements(data, nullptr);
    XXH3_64bits_update(reinterpret_cast<XXH3_state_t *>(ptr), bytes, static_cast<size_t>(length));
    env->ReleaseByteArrayElements(data, bytes, JNI_ABORT);
}

extern "C" JNIEXPORT void JNICALL
Java_com_preeternal_filehash_NativeHasher_xxh3Update128(JNIEnv *env, jobject, jlong ptr, jbyteArray data, jint length) {
    if (ptr == 0 || length <= 0) {
        return;
    }
    jbyte *bytes = env->GetByteArrayElements(data, nullptr);
    XXH3_128bits_update(reinterpret_cast<XXH3_state_t *>(ptr), bytes, static_cast<size_t>(length));
    env->ReleaseByteArrayElements(data, bytes, JNI_ABORT);
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_preeternal_filehash_NativeHasher_xxh3Digest64(JNIEnv *, jobject, jlong ptr) {
    if (ptr == 0) {
        return 0;
    }
    return static_cast<jlong>(XXH3_64bits_digest(reinterpret_cast<XXH3_state_t *>(ptr)));
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_preeternal_filehash_NativeHasher_xxh3Digest128(JNIEnv *env, jobject, jlong ptr) {
    if (ptr == 0) {
        return nullptr;
    }

    const XXH128_hash_t digest = XXH3_128bits_digest(reinterpret_cast<XXH3_state_t *>(ptr));
    jbyteArray out = env->NewByteArray(16);
    if (out == nullptr) {
        return nullptr;
    }

    jbyte buf[16];
    for (int i = 0; i < 8; i++) {
        buf[i] = static_cast<jbyte>((digest.low64 >> (56 - 8 * i)) & 0xFF);
        buf[8 + i] = static_cast<jbyte>((digest.high64 >> (56 - 8 * i)) & 0xFF);
    }
    env->SetByteArrayRegion(out, 0, 16, buf);
    return out;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_preeternal_filehash_NativeHasher_blake3Init(JNIEnv *, jobject) {
    auto *state = new blake3_hasher();
    if (state == nullptr) {
        return 0;
    }
    blake3_hasher_init(state);
    return reinterpret_cast<jlong>(state);
}

extern "C" JNIEXPORT void JNICALL
Java_com_preeternal_filehash_NativeHasher_blake3Update(JNIEnv *env, jobject, jlong ptr, jbyteArray data, jint length) {
    if (ptr == 0 || length <= 0) {
        return;
    }
    jbyte *bytes = env->GetByteArrayElements(data, nullptr);
    blake3_hasher_update(reinterpret_cast<blake3_hasher *>(ptr), bytes, static_cast<size_t>(length));
    env->ReleaseByteArrayElements(data, bytes, JNI_ABORT);
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_preeternal_filehash_NativeHasher_blake3Digest(JNIEnv *env, jobject, jlong ptr) {
    if (ptr == 0) {
        return nullptr;
    }
    jbyteArray out = env->NewByteArray(BLAKE3_OUT_LEN);
    if (out == nullptr) {
        return nullptr;
    }
    uint8_t buffer[BLAKE3_OUT_LEN];
    blake3_hasher_finalize(reinterpret_cast<blake3_hasher *>(ptr), buffer, BLAKE3_OUT_LEN);
    env->SetByteArrayRegion(out, 0, BLAKE3_OUT_LEN, reinterpret_cast<jbyte *>(buffer));
    return out;
}

extern "C" JNIEXPORT void JNICALL
Java_com_preeternal_filehash_NativeHasher_xxh3Free(JNIEnv *, jobject, jlong ptr) {
    if (ptr == 0) {
        return;
    }
    XXH3_freeState(reinterpret_cast<XXH3_state_t *>(ptr));
}

extern "C" JNIEXPORT void JNICALL
Java_com_preeternal_filehash_NativeHasher_blake3Free(JNIEnv *, jobject, jlong ptr) {
    if (ptr == 0) {
        return;
    }
    delete reinterpret_cast<blake3_hasher *>(ptr);
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_preeternal_filehash_NativeHasher_blake3InitKeyed(JNIEnv *env, jobject, jbyteArray keyArr) {
    if (keyArr == nullptr) {
        return 0;
    }
    jsize len = env->GetArrayLength(keyArr);
    if (len != 32) {
        return 0;
    }
    jbyte *keyBytes = env->GetByteArrayElements(keyArr, nullptr);
    if (keyBytes == nullptr) {
        return 0;
    }
    auto *state = new blake3_hasher();
    if (state == nullptr) {
        env->ReleaseByteArrayElements(keyArr, keyBytes, JNI_ABORT);
        return 0;
    }
    blake3_hasher_init_keyed(state, reinterpret_cast<uint8_t *>(keyBytes));
    env->ReleaseByteArrayElements(keyArr, keyBytes, JNI_ABORT);
    return reinterpret_cast<jlong>(state);
}
