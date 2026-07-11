package com.preeternal.filehash

import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.FileNotFoundException

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
        val result = hashFile(filePath, algorithm, options, operation)
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

    private fun hashFile(
        filePath: String,
        algorithm: String,
        options: HashRequestOptions,
        operation: HashOperation?
    ): String {
        val uri = Uri.parse(filePath)
        val scheme = uri.scheme?.lowercase()
        return when (scheme) {
            null, "", "file" -> {
                val path = if (scheme == "file") {
                    uri.path ?: throw FileNotFoundException("Cannot resolve file uri: $filePath")
                } else {
                    filePath
                }
                hashFilePath(path, algorithm, options, operation)
            }
            "content" -> hashContentUri(uri, filePath, algorithm, options, operation)
            else -> hashFileStreaming(filePath, algorithm, options, operation)
        }
    }

    private fun hashFilePath(
        path: String,
        algorithm: String,
        options: HashRequestOptions,
        operation: HashOperation?
    ): String {
        operation?.throwIfCancelled()
        val digest =
            ZigHasher.fileHashPath(
                path,
                algorithm,
                options.key,
                options.seed ?: 0L,
                options.seed != null,
                options.mmap,
                operation?.id
            )
                ?: throw IllegalStateException("Zig engine returned null digest")
        operation?.throwIfCancelled()
        return toHex(digest)
    }

    private fun hashContentUri(
        uri: Uri,
        originalPath: String,
        algorithm: String,
        options: HashRequestOptions,
        operation: HashOperation?
    ): String {
        val descriptor = try {
            reactContext.contentResolver.openFileDescriptor(uri, "r")
        } catch (_: FileNotFoundException) {
            null
        }

        if (descriptor == null) {
            return hashFileStreaming(originalPath, algorithm, options, operation)
        }

        val hashDescriptor: (android.os.ParcelFileDescriptor) -> String = {
            operation?.throwIfCancelled()
            val digest =
                ZigHasher.fileHashFd(
                    it.fd,
                    algorithm,
                    options.key,
                    options.seed ?: 0L,
                    options.seed != null,
                    operation?.id
                )
                    ?: throw IllegalStateException("Zig engine returned null digest")
            operation?.throwIfCancelled()
            toHex(digest)
        }

        return if (operation != null) {
            operation.useCloseable(descriptor) { activeDescriptor ->
                activeDescriptor.use(hashDescriptor)
            }
        } else {
            descriptor.use(hashDescriptor)
        }
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
