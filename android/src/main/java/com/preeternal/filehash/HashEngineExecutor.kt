package com.preeternal.filehash

internal interface HashEngineExecutor {
    suspend fun fileHash(filePath: String, algorithm: String, key: ByteArray?): String

    fun stringHash(bytes: ByteArray, algorithm: String, key: ByteArray?): String
}
