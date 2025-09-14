package com.preeternal.filehash

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.InputStream
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException

@ReactModule(name = FileHashModule.NAME)
class FileHashModule(
    private val reactContext: ReactApplicationContext
) : NativeFileHashSpec(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun getName(): String = NAME

    @ReactMethod
    override fun fileHash(filePath: String, algorithm: String, promise: Promise) {
        scope.launch {
            try {
                val algo = normalizeAlgorithm(algorithm)
                val hex = computeHash(filePath, algo)
                promise.resolve(hex)
            } catch (e: NoSuchAlgorithmException) {
                promise.reject("E_UNSUPPORTED_ALGORITHM", "Unsupported algorithm: $algorithm", e)
            } catch (e: FileNotFoundException) {
                promise.reject("E_FILE_NOT_FOUND", "File not found or cannot open: $filePath", e)
            } catch (ce: CancellationException) {
                promise.reject("E_CANCELLED", "Hash computation cancelled")
            } catch (e: Exception) {
                promise.reject("E_HASH_FAILED", "Failed to compute hash for algorithm $algorithm", e)
            }
        }
    }

    override fun invalidate() {
        super.invalidate()
        scope.cancel()
    }

    private fun normalizeAlgorithm(input: String): String = when (input) {
        "MD5" -> "MD5"
        "SHA-1" -> "SHA-1"
        "SHA-224" -> "SHA-224"
        "SHA-256" -> "SHA-256"
        "SHA-384" -> "SHA-384"
        "SHA-512" -> "SHA-512"
        else -> throw IllegalArgumentException("Unsupported algorithm: $input")
    }

    private suspend fun computeHash(filePath: String, algorithm: String): String = withContext(Dispatchers.IO) {
        val digest = MessageDigest.getInstance(algorithm)
        openInputStream(filePath).use { stream ->
            val buffer = ByteArray(64 * 1024)
            var read: Int
            while (stream.read(buffer).also { read = it } != -1) {
                digest.update(buffer, 0, read)
            }
        }
        val bytes = digest.digest()
        bytes.joinToString("") { "%02x".format(it) }
    }

    private fun openInputStream(filePath: String): InputStream {
        val uri = Uri.parse(filePath)
        return when (uri.scheme?.lowercase()) {
            null, "", "file" -> {
                val path = if (uri.scheme == "file") uri.path ?: filePath else filePath
                val file = File(path)
                if (!file.exists()) throw FileNotFoundException("File not found: $filePath")
                FileInputStream(file)
            }
            "content" -> {
                reactContext.contentResolver.openInputStream(uri)
                    ?: throw FileNotFoundException("Cannot open content uri: $filePath")
            }
            else -> {
                reactContext.contentResolver.openInputStream(uri)
                    ?: throw FileNotFoundException("Unsupported uri scheme or cannot open: $filePath")
            }
        }
    }

    companion object {
        const val NAME = "FileHash"
    }
}
