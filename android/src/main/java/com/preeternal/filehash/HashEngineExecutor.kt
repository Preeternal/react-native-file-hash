package com.preeternal.filehash

internal interface HashEngineExecutor {
    suspend fun fileHash(
        filePath: String,
        algorithm: String,
        options: HashRequestOptions,
        operation: HashOperation?
    ): String

    fun stringHash(
        bytes: ByteArray,
        algorithm: String,
        options: HashRequestOptions,
        operation: HashOperation?
    ): String
}
