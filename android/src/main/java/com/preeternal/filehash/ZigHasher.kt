package com.preeternal.filehash

internal object ZigHasher {
    init {
        System.loadLibrary("filehash-native")
    }

    external fun apiVersion(): Int

    external fun expectedApiVersion(): Int

    external fun hasArm64Sha2(): Boolean

    external fun stringHash(
        algorithm: String,
        data: ByteArray,
        key: ByteArray?
    ): ByteArray?

    external fun fileHash(
        algorithm: String,
        path: String,
        key: ByteArray?
    ): ByteArray?

    external fun streamHasherCreate(
        algorithm: String,
        key: ByteArray?
    ): Long

    external fun streamHasherUpdate(
        handle: Long,
        data: ByteArray,
        length: Int
    )

    external fun streamHasherFinal(handle: Long): ByteArray?

    external fun streamHasherFree(handle: Long)
}
