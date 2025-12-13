package com.preeternal.filehash

internal object NativeHasher {
    init {
        System.loadLibrary("filehash-native")
    }

    external fun xxh3Init64(): Long
    external fun xxh3Init128(): Long
    external fun xxh3Update64(statePtr: Long, data: ByteArray, length: Int)
    external fun xxh3Update128(statePtr: Long, data: ByteArray, length: Int)
    external fun xxh3Digest64(statePtr: Long): Long
    external fun xxh3Digest128(statePtr: Long): ByteArray

    external fun blake3Init(): Long
    external fun blake3Update(statePtr: Long, data: ByteArray, length: Int)
    external fun blake3Digest(statePtr: Long): ByteArray
    external fun blake3Free(statePtr: Long)
    external fun blake3InitKeyed(key: ByteArray): Long

    external fun xxh3Free(statePtr: Long)
}
