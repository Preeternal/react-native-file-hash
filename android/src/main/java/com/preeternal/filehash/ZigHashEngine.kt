package com.preeternal.filehash

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
        options: HashRequestOptions,
        operation: HashOperation?
    ): String = withContext(Dispatchers.IO) {
        operation?.throwIfCancelled()
        validateHashOptionsUsage(algorithm, options)
        val result = hashFileStreaming(filePath, algorithm, options, operation)
        operation?.throwIfCancelled()
        return@withContext result
    }

    override fun stringHash(
        bytes: ByteArray,
        algorithm: String,
        options: HashRequestOptions,
        operation: HashOperation?
    ): String {
        operation?.throwIfCancelled()
        validateHashOptionsUsage(algorithm, options)
        val digest =
            ZigHasher.stringHash(
                algorithm,
                bytes,
                options.key,
                options.seed ?: 0L,
                options.seed != null,
                operation?.id
            )
                ?: throw IllegalStateException("Zig engine returned null digest")
        operation?.throwIfCancelled()
        return toHex(digest)
    }

    private fun hashFileStreaming(
        filePath: String,
        algorithm: String,
        options: HashRequestOptions,
        operation: HashOperation?
    ): String {
        val inputStream = openInputStream(reactContext, filePath)
        return if (operation != null) {
            operation.useCloseable(inputStream) { stream ->
                stream.use { hashStream(it, algorithm, options, operation) }
            }
        } else {
            inputStream.use { stream -> hashStream(stream, algorithm, options, null) }
        }
    }

    private fun hashStream(
        stream: java.io.InputStream,
        algorithm: String,
        options: HashRequestOptions,
        operation: HashOperation?
    ): String {
        val handle = ZigHasher.streamHasherCreate(
            algorithm,
            options.key,
            options.seed ?: 0L,
            options.seed != null,
            operation?.id
        )
        if (handle == 0L) {
            throw IllegalStateException("Failed to create Zig streaming hasher")
        }

        val buffer = ByteArray(bufferSize)
        var read: Int
        try {
            operation?.throwIfCancelled()
            while (stream.read(buffer).also { read = it } != -1) {
                operation?.throwIfCancelled()
                if (read > 0) {
                    ZigHasher.streamHasherUpdate(handle, buffer, read)
                }
            }
            operation?.throwIfCancelled()

            val digest =
                ZigHasher.streamHasherFinal(handle)
                    ?: throw IllegalStateException("Zig engine returned null digest")
            operation?.throwIfCancelled()
            return toHex(digest)
        } finally {
            ZigHasher.streamHasherFree(handle)
        }
    }
}
