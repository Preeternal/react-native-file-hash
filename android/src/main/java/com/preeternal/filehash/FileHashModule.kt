package com.preeternal.filehash

import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
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
    private val bufferSize = 64 * 1024

    override fun getName(): String = NAME

    @ReactMethod
    override fun fileHash(filePath: String, algorithm: String, options: ReadableMap?, promise: Promise) {
        scope.launch {
            try {
                val opts = parseOptions(options)
                val algo = normalizeAlgorithm(algorithm)
                val hex = when (opts.first) {
                    "hash" -> computeHashForFile(filePath, algo)
                    "hmac" -> {
                        val key = opts.second ?: throw IllegalArgumentException("Key is required for HMAC mode")
                        if (!isHmacCapable(algo)) throw IllegalArgumentException("HMAC is supported only for SHA-224/256/384/512")
                        hashFileHmac(filePath, algo, key)
                    }
                    "keyed" -> {
                        if (!isKeyedCapable(algo)) throw IllegalArgumentException("Keyed mode is only supported for BLAKE3")
                        val key = opts.second ?: throw IllegalArgumentException("Key is required for keyed mode")
                        if (key.size != 32) throw IllegalArgumentException("BLAKE3 keyed mode requires a 32-byte key")
                        hashBlake3FileKeyed(filePath, key)
                    }
                    else -> throw IllegalArgumentException("Unsupported mode: ${opts.first}")
                }
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

    @ReactMethod
    override fun hashString(text: String, algorithm: String, encoding: String?, options: ReadableMap?, promise: Promise) {
        scope.launch {
            try {
                val opts = parseOptions(options)
                val algo = normalizeAlgorithm(algorithm)
                val enc = encoding?.lowercase() ?: "utf8"
                val bytes = when (enc) {
                    "base64" -> try {
                        Base64.decode(text, Base64.DEFAULT)
                    } catch (e: IllegalArgumentException) {
                        promise.reject("E_INVALID_INPUT", "Invalid base64 input", e)
                        return@launch
                    }
                    else -> text.toByteArray(Charsets.UTF_8)
                }

                val hex = when (opts.first) {
                    "hash" -> computeHashForBytes(bytes, algo)
                    "hmac" -> {
                        val key = opts.second ?: throw IllegalArgumentException("Key is required for HMAC mode")
                        if (!isHmacCapable(algo)) throw IllegalArgumentException("HMAC is supported only for SHA-224/256/384/512")
                        hmacBytes(bytes, algo, key)
                    }
                    "keyed" -> {
                        if (!isKeyedCapable(algo)) throw IllegalArgumentException("Keyed mode is only supported for BLAKE3")
                        val key = opts.second ?: throw IllegalArgumentException("Key is required for keyed mode")
                        if (key.size != 32) throw IllegalArgumentException("BLAKE3 keyed mode requires a 32-byte key")
                        hashBlake3BytesKeyed(bytes, key)
                    }
                    else -> throw IllegalArgumentException("Unsupported mode: ${opts.first}")
                }
                promise.resolve(hex)
            } catch (e: NoSuchAlgorithmException) {
                promise.reject("E_UNSUPPORTED_ALGORITHM", "Unsupported algorithm: $algorithm", e)
            } catch (e: Exception) {
                promise.reject("E_HASH_FAILED", "Failed to compute hash for algorithm $algorithm", e)
            }
        }
    }

    private fun normalizeAlgorithm(input: String): String = when (input) {
        "MD5" -> "MD5"
        "SHA-1" -> "SHA-1"
        "SHA-224" -> "SHA-224"
        "SHA-256" -> "SHA-256"
        "SHA-384" -> "SHA-384"
        "SHA-512" -> "SHA-512"
        "XXH3-64" -> "XXH3-64"
        "XXH3-128" -> "XXH3-128"
        "BLAKE3" -> "BLAKE3"
        else -> throw IllegalArgumentException("Unsupported algorithm: $input")
    }

    private fun isHmacCapable(algo: String): Boolean =
        algo == "SHA-224" || algo == "SHA-256" || algo == "SHA-384" || algo == "SHA-512"

    private fun isKeyedCapable(algo: String): Boolean = algo == "BLAKE3"

    private fun decodeKey(key: String, encoding: String): ByteArray {
        return when (encoding.lowercase()) {
            "base64" -> Base64.decode(key, Base64.DEFAULT)
            "hex" -> {
                val cleaned = key.replace("\\s".toRegex(), "")
                require(cleaned.length % 2 == 0) { "Hex key length must be even" }
                val out = ByteArray(cleaned.length / 2)
                var i = 0
                while (i < cleaned.length) {
                    out[i / 2] = cleaned.substring(i, i + 2).toInt(16).toByte()
                    i += 2
                }
                out
            }
            else -> key.toByteArray(Charsets.UTF_8)
        }
    }

    private fun parseOptions(options: ReadableMap?): Triple<String, ByteArray?, String> {
        val mode = options?.getString("mode")?.lowercase() ?: "hash"
        val keyEncoding = options?.getString("keyEncoding")?.lowercase() ?: "utf8"
        val keyString = options?.getString("key")
        val keyBytes = if (keyString != null) decodeKey(keyString, keyEncoding) else null
        return Triple(mode, keyBytes, keyEncoding)
    }

    private suspend fun computeHashForFile(filePath: String, algorithm: String): String = withContext(Dispatchers.IO) {
        openInputStream(filePath).use { stream ->
            return@withContext when (algorithm) {
                "XXH3-64" -> hashXXH3(stream, is128 = false)
                "XXH3-128" -> hashXXH3(stream, is128 = true)
                "BLAKE3" -> hashBlake3(stream)
                else -> hashWithMessageDigest(stream, algorithm)
            }
        }
    }

    private fun computeHashForBytes(bytes: ByteArray, algorithm: String): String = when (algorithm) {
        "XXH3-64" -> hashXXH3Bytes(bytes, is128 = false)
        "XXH3-128" -> hashXXH3Bytes(bytes, is128 = true)
        "BLAKE3" -> hashBlake3Bytes(bytes)
        else -> hashWithMessageDigest(bytes, algorithm)
    }

    private fun hashFileHmac(filePath: String, algorithm: String, key: ByteArray): String =
        openInputStream(filePath).use { stream ->
            val mac = Mac.getInstance(
                when (algorithm) {
                    "SHA-224" -> "HmacSHA224"
                    "SHA-256" -> "HmacSHA256"
                    "SHA-384" -> "HmacSHA384"
                    "SHA-512" -> "HmacSHA512"
                    else -> throw IllegalArgumentException("Unsupported HMAC algorithm: $algorithm")
                }
            )
            mac.init(SecretKeySpec(key, mac.algorithm))
            val buffer = ByteArray(bufferSize)
            var read: Int
            while (stream.read(buffer).also { read = it } != -1) {
                if (read > 0) {
                    mac.update(buffer, 0, read)
                }
            }
            toHex(mac.doFinal())
        }

    private fun hmacBytes(bytes: ByteArray, algorithm: String, key: ByteArray): String {
        val mac = Mac.getInstance(
            when (algorithm) {
                "SHA-224" -> "HmacSHA224"
                "SHA-256" -> "HmacSHA256"
                "SHA-384" -> "HmacSHA384"
                "SHA-512" -> "HmacSHA512"
                else -> throw IllegalArgumentException("Unsupported HMAC algorithm: $algorithm")
            }
        )
        mac.init(SecretKeySpec(key, mac.algorithm))
        mac.update(bytes)
        return toHex(mac.doFinal())
    }

    private fun hashBlake3FileKeyed(filePath: String, key: ByteArray): String =
        openInputStream(filePath).use { stream ->
            val state = NativeHasher.blake3InitKeyed(key)
            require(state != 0L) { "Failed to allocate BLAKE3 keyed state" }
            val buffer = ByteArray(bufferSize)
            var read: Int
            try {
                while (stream.read(buffer).also { read = it } != -1) {
                    if (read > 0) {
                        NativeHasher.blake3Update(state, buffer, read)
                    }
                }
                val out = NativeHasher.blake3Digest(state)
                toHex(out)
            } finally {
                NativeHasher.blake3Free(state)
            }
        }

    private fun hashWithMessageDigest(stream: InputStream, algorithm: String): String {
        val digest = MessageDigest.getInstance(algorithm)
        val buffer = ByteArray(bufferSize)
        var read: Int
        while (stream.read(buffer).also { read = it } != -1) {
            if (read > 0) {
                digest.update(buffer, 0, read)
            }
        }
        val bytes = digest.digest()
        return toHex(bytes)
    }

    private fun hashXXH3(stream: InputStream, is128: Boolean): String {
        val state = if (is128) NativeHasher.xxh3Init128() else NativeHasher.xxh3Init64()
        require(state != 0L) { "Failed to allocate XXH3 state" }

        val buffer = ByteArray(bufferSize)
        var read: Int
        try {
            while (stream.read(buffer).also { read = it } != -1) {
                if (read > 0) {
                    if (is128) {
                        NativeHasher.xxh3Update128(state, buffer, read)
                    } else {
                        NativeHasher.xxh3Update64(state, buffer, read)
                    }
                }
            }

            return if (is128) {
                val out = NativeHasher.xxh3Digest128(state)
                toHex(out)
            } else {
                val out = NativeHasher.xxh3Digest64(state)
                out.toULong().toString(16).padStart(16, '0')
            }
        } finally {
            NativeHasher.xxh3Free(state)
        }
    }

    private fun hashBlake3(stream: InputStream): String {
        val state = NativeHasher.blake3Init()
        require(state != 0L) { "Failed to allocate BLAKE3 state" }

        val buffer = ByteArray(bufferSize)
        var read: Int
        try {
            while (stream.read(buffer).also { read = it } != -1) {
                if (read > 0) {
                    NativeHasher.blake3Update(state, buffer, read)
                }
            }
            val out = NativeHasher.blake3Digest(state)
            return toHex(out)
        } finally {
            NativeHasher.blake3Free(state)
        }
    }

    private fun hashWithMessageDigest(bytes: ByteArray, algorithm: String): String {
        val digest = MessageDigest.getInstance(algorithm)
        digest.update(bytes)
        val out = digest.digest()
        return toHex(out)
    }

    private fun hashXXH3Bytes(bytes: ByteArray, is128: Boolean): String {
        val state = if (is128) NativeHasher.xxh3Init128() else NativeHasher.xxh3Init64()
        require(state != 0L) { "Failed to allocate XXH3 state" }
        try {
            if (is128) {
                NativeHasher.xxh3Update128(state, bytes, bytes.size)
                val out = NativeHasher.xxh3Digest128(state)
                return toHex(out)
            } else {
                NativeHasher.xxh3Update64(state, bytes, bytes.size)
                val out = NativeHasher.xxh3Digest64(state)
                return out.toULong().toString(16).padStart(16, '0')
            }
        } finally {
            NativeHasher.xxh3Free(state)
        }
    }

    private fun hashBlake3Bytes(bytes: ByteArray): String {
        val state = NativeHasher.blake3Init()
        require(state != 0L) { "Failed to allocate BLAKE3 state" }
        try {
            NativeHasher.blake3Update(state, bytes, bytes.size)
            val out = NativeHasher.blake3Digest(state)
            return toHex(out)
        } finally {
            NativeHasher.blake3Free(state)
        }
    }

    private fun hashBlake3BytesKeyed(bytes: ByteArray, key: ByteArray): String {
        val state = NativeHasher.blake3InitKeyed(key)
        require(state != 0L) { "Failed to allocate BLAKE3 keyed state" }
        try {
            NativeHasher.blake3Update(state, bytes, bytes.size)
            val out = NativeHasher.blake3Digest(state)
            return toHex(out)
        } finally {
            NativeHasher.blake3Free(state)
        }
    }

    private fun toHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

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
