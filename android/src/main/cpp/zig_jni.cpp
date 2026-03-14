#include "jni_utils.h"
#include "zig_bridge.h"

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_preeternal_filehash_ZigHasher_stringHash(
    JNIEnv *env,
    jobject,
    jstring algorithm_j,
    jbyteArray data_j,
    jbyteArray key_j
) {
    const std::string algorithm = filehash::jni::JStringToUtf8(env, algorithm_j);
    const std::vector<uint8_t> data = filehash::jni::JByteArrayToVector(env, data_j);
    const std::vector<uint8_t> key = filehash::jni::JByteArrayToVector(env, key_j);
    std::vector<uint8_t> digest;

    if (!filehash::zig::StringHash(
            env,
            algorithm,
            data,
            key_j != nullptr,
            key,
            &digest
        )) {
        return nullptr;
    }

    return filehash::jni::MakeJavaByteArray(env, digest.data(), digest.size());
}

extern "C" JNIEXPORT jint JNICALL
Java_com_preeternal_filehash_ZigHasher_apiVersion(JNIEnv *, jobject) {
    return filehash::zig::ApiVersion();
}

extern "C" JNIEXPORT jint JNICALL
Java_com_preeternal_filehash_ZigHasher_expectedApiVersion(JNIEnv *, jobject) {
    return filehash::zig::ExpectedApiVersion();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_preeternal_filehash_ZigHasher_hasArm64Sha2(JNIEnv *, jobject) {
    return filehash::zig::HasArm64Sha2() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_preeternal_filehash_ZigHasher_fileHash(
    JNIEnv *env,
    jobject,
    jstring algorithm_j,
    jstring path_j,
    jbyteArray key_j
) {
    const std::string algorithm = filehash::jni::JStringToUtf8(env, algorithm_j);
    const std::string path = filehash::jni::JStringToUtf8(env, path_j);
    const std::vector<uint8_t> key = filehash::jni::JByteArrayToVector(env, key_j);
    std::vector<uint8_t> digest;

    if (!filehash::zig::FileHash(
            env,
            algorithm,
            path,
            key_j != nullptr,
            key,
            &digest
        )) {
        return nullptr;
    }

    return filehash::jni::MakeJavaByteArray(env, digest.data(), digest.size());
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_preeternal_filehash_ZigHasher_streamHasherCreate(
    JNIEnv *env,
    jobject,
    jstring algorithm_j,
    jbyteArray key_j
) {
    const std::string algorithm = filehash::jni::JStringToUtf8(env, algorithm_j);
    const std::vector<uint8_t> key = filehash::jni::JByteArrayToVector(env, key_j);
    jlong handle = 0;

    if (!filehash::zig::StreamHasherCreate(
            env,
            algorithm,
            key_j != nullptr,
            key,
            &handle
        )) {
        return 0;
    }

    return handle;
}

extern "C" JNIEXPORT void JNICALL
Java_com_preeternal_filehash_ZigHasher_streamHasherUpdate(
    JNIEnv *env,
    jobject,
    jlong handle,
    jbyteArray data_j,
    jint length
) {
    if (length < 0) {
        filehash::jni::ThrowException(
            env,
            "java/lang/IllegalArgumentException",
            "Invalid chunk length"
        );
        return;
    }

    const std::vector<uint8_t> data = filehash::jni::JByteArrayToVector(
        env,
        data_j,
        static_cast<size_t>(length)
    );

    filehash::zig::StreamHasherUpdate(env, handle, data);
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_preeternal_filehash_ZigHasher_streamHasherFinal(
    JNIEnv *env,
    jobject,
    jlong handle
) {
    std::vector<uint8_t> digest;
    if (!filehash::zig::StreamHasherFinal(env, handle, &digest)) {
        return nullptr;
    }

    return filehash::jni::MakeJavaByteArray(env, digest.data(), digest.size());
}

extern "C" JNIEXPORT void JNICALL
Java_com_preeternal_filehash_ZigHasher_streamHasherFree(
    JNIEnv *,
    jobject,
    jlong handle
) {
    filehash::zig::StreamHasherFree(handle);
}
