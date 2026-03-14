package com.preeternal.filehash

import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal class ZigHashEngine(
    private val reactContext: ReactApplicationContext,
    private val bufferSize: Int = DEFAULT_BUFFER_SIZE
) : HashEngineExecutor {

    override suspend fun fileHash(
        filePath: String,
        algorithm: String,
        key: ByteArray?
    ): String = withContext(Dispatchers.IO) {
        validateKeyUsage(algorithm, key)
        val normalizedPath = normalizedLocalPathForZig(filePath)
        if (normalizedPath != null) {
            val digest =
                ZigHasher.fileHash(algorithm, normalizedPath, key)
                    ?: throw IllegalStateException("Zig engine returned null digest")
            return@withContext toHex(digest)
        }

        return@withContext hashFileStreaming(filePath, algorithm, key)
    }

    override fun stringHash(
        bytes: ByteArray,
        algorithm: String,
        key: ByteArray?
    ): String {
        validateKeyUsage(algorithm, key)
        val digest =
            ZigHasher.stringHash(algorithm, bytes, key)
                ?: throw IllegalStateException("Zig engine returned null digest")
        return toHex(digest)
    }

    private fun normalizedLocalPathForZig(filePath: String): String? {
        val uri = Uri.parse(filePath)
        return when (uri.scheme?.lowercase()) {
            null, "" -> filePath
            "file" -> uri.path?.let { Uri.decode(it) }
            else -> null
        }
    }

    private fun hashFileStreaming(
        filePath: String,
        algorithm: String,
        key: ByteArray?
    ): String = openInputStream(reactContext, filePath).use { stream ->
        val handle = ZigHasher.streamHasherCreate(algorithm, key)
        if (handle == 0L) {
            throw IllegalStateException("Failed to create Zig streaming hasher")
        }

        val buffer = ByteArray(bufferSize)
        var read: Int
        try {
            while (stream.read(buffer).also { read = it } != -1) {
                if (read > 0) {
                    ZigHasher.streamHasherUpdate(handle, buffer, read)
                }
            }

            val digest =
                ZigHasher.streamHasherFinal(handle)
                    ?: throw IllegalStateException("Zig engine returned null digest")
            toHex(digest)
        } finally {
            ZigHasher.streamHasherFree(handle)
        }
    }
}
