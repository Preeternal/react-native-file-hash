package com.preeternal.filehash

import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException
import java.security.Security
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

internal class NativeHashEngine(
    private val reactContext: ReactApplicationContext,
    private val bufferSize: Int = DEFAULT_BUFFER_SIZE
) : HashEngineExecutor {

    override suspend fun fileHash(
        filePath: String,
        algorithm: String,
        key: ByteArray?
    ): String = withContext(Dispatchers.IO) {
        validateKeyUsage(algorithm, key)
        return@withContext if (isHmacAlgorithm(algorithm)) {
            hashFileHmac(filePath, algorithm, key ?: error("validated"))
        } else if (algorithm == "BLAKE3" && key != null) {
            hashBlake3FileKeyed(filePath, key)
        } else {
            computeHashForFile(filePath, algorithm)
        }
    }

    override fun stringHash(
        bytes: ByteArray,
        algorithm: String,
        key: ByteArray?
    ): String {
        validateKeyUsage(algorithm, key)
        return if (isHmacAlgorithm(algorithm)) {
            hmacBytes(bytes, algorithm, key ?: error("validated"))
        } else if (algorithm == "BLAKE3" && key != null) {
            hashBlake3BytesKeyed(bytes, key)
        } else {
            computeHashForBytes(bytes, algorithm)
        }
    }

    private fun computeHashForFile(filePath: String, algorithm: String): String =
        openInputStream(reactContext, filePath).use { stream ->
            when (algorithm) {
                "XXH3-64" -> hashXXH3(stream, is128 = false)
                "XXH3-128" -> hashXXH3(stream, is128 = true)
                "BLAKE3" -> hashBlake3(stream)
                "SHA-512/224" -> hashSha512tWithProviderFallback(
                    stream = stream,
                    algorithm = algorithm,
                    variant = Sha512t.Variant.SHA_512_224
                )
                "SHA-512/256" -> hashSha512tWithProviderFallback(
                    stream = stream,
                    algorithm = algorithm,
                    variant = Sha512t.Variant.SHA_512_256
                )
                else -> hashWithMessageDigest(stream, algorithm)
            }
        }

    private fun computeHashForBytes(bytes: ByteArray, algorithm: String): String = when (algorithm) {
        "XXH3-64" -> hashXXH3Bytes(bytes, is128 = false)
        "XXH3-128" -> hashXXH3Bytes(bytes, is128 = true)
        "BLAKE3" -> hashBlake3Bytes(bytes)
        "SHA-512/224" -> hashSha512tWithProviderFallback(
            bytes = bytes,
            algorithm = algorithm,
            variant = Sha512t.Variant.SHA_512_224
        )
        "SHA-512/256" -> hashSha512tWithProviderFallback(
            bytes = bytes,
            algorithm = algorithm,
            variant = Sha512t.Variant.SHA_512_256
        )
        else -> hashWithMessageDigest(bytes, algorithm)
    }

    private fun hashFileHmac(filePath: String, algorithm: String, key: ByteArray): String =
        openInputStream(reactContext, filePath).use { stream ->
            if (key.isEmpty()) {
                return@use toHex(computeHmacForStream(stream, algorithm, key))
            }

            val mac = Mac.getInstance(
                hmacJavaName(algorithm)
                    ?: throw IllegalArgumentException("Unsupported HMAC algorithm: $algorithm")
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
        if (key.isEmpty()) {
            return toHex(computeHmacForBytes(bytes, algorithm, key))
        }

        val mac = Mac.getInstance(
            hmacJavaName(algorithm)
                ?: throw IllegalArgumentException("Unsupported HMAC algorithm: $algorithm")
        )
        mac.init(SecretKeySpec(key, mac.algorithm))
        mac.update(bytes)
        return toHex(mac.doFinal())
    }

    private fun hashBlake3FileKeyed(filePath: String, key: ByteArray): String =
        openInputStream(reactContext, filePath).use { stream ->
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
                toHex(NativeHasher.blake3Digest(state))
            } finally {
                NativeHasher.blake3Free(state)
            }
        }

    private fun hashWithMessageDigest(stream: InputStream, algorithm: String): String {
        val digest = resolveMessageDigest(algorithm)
        val buffer = ByteArray(bufferSize)
        var read: Int
        while (stream.read(buffer).also { read = it } != -1) {
            if (read > 0) {
                digest.update(buffer, 0, read)
            }
        }
        return toHex(digest.digest())
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
                toHex(NativeHasher.xxh3Digest128(state))
            } else {
                NativeHasher.xxh3Digest64(state).toULong().toString(16).padStart(16, '0')
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
            return toHex(NativeHasher.blake3Digest(state))
        } finally {
            NativeHasher.blake3Free(state)
        }
    }

    private fun hashWithMessageDigest(bytes: ByteArray, algorithm: String): String {
        val digest = resolveMessageDigest(algorithm)
        digest.update(bytes)
        return toHex(digest.digest())
    }

    private fun hashSha512tWithProviderFallback(
        stream: InputStream,
        algorithm: String,
        variant: Sha512t.Variant
    ): String {
        return try {
            hashWithMessageDigest(stream, algorithm)
        } catch (_: NoSuchAlgorithmException) {
            toHex(Sha512t.digestStream(stream, bufferSize, variant))
        }
    }

    private fun hashSha512tWithProviderFallback(
        bytes: ByteArray,
        algorithm: String,
        variant: Sha512t.Variant
    ): String {
        return try {
            hashWithMessageDigest(bytes, algorithm)
        } catch (_: NoSuchAlgorithmException) {
            toHex(Sha512t.digestBytes(bytes, variant))
        }
    }

    private fun resolveMessageDigest(algorithm: String): MessageDigest {
        val candidates = digestAliases(algorithm)
        val providers = Security.getProviders()

        for (name in candidates) {
            try {
                return MessageDigest.getInstance(name)
            } catch (_: NoSuchAlgorithmException) {
                // Try provider-specific lookup below.
            }

            for (provider in providers) {
                try {
                    return MessageDigest.getInstance(name, provider)
                } catch (_: Exception) {
                    // Keep scanning providers.
                }
            }
        }

        throw NoSuchAlgorithmException("Unsupported algorithm: $algorithm")
    }

    private fun digestAliases(algorithm: String): List<String> = when (algorithm) {
        "SHA-512/224" -> listOf(
            "SHA-512/224",
            "SHA-512-224",
            "SHA512/224",
            "SHA512-224",
            "2.16.840.1.101.3.4.2.5"
        )
        "SHA-512/256" -> listOf(
            "SHA-512/256",
            "SHA-512-256",
            "SHA512/256",
            "SHA512-256",
            "2.16.840.1.101.3.4.2.6"
        )
        else -> listOf(algorithm)
    }

    private data class HmacSpec(
        val digestAlgorithm: String,
        val blockSize: Int
    )

    private fun hmacSpec(algorithm: String): HmacSpec = when (algorithm) {
        "HMAC-SHA-224" -> HmacSpec("SHA-224", 64)
        "HMAC-SHA-256" -> HmacSpec("SHA-256", 64)
        "HMAC-SHA-384" -> HmacSpec("SHA-384", 128)
        "HMAC-SHA-512" -> HmacSpec("SHA-512", 128)
        "HMAC-MD5" -> HmacSpec("MD5", 64)
        "HMAC-SHA-1" -> HmacSpec("SHA-1", 64)
        else -> throw IllegalArgumentException("Unsupported HMAC algorithm: $algorithm")
    }

    private fun computeHmacForBytes(
        bytes: ByteArray,
        algorithm: String,
        key: ByteArray
    ): ByteArray {
        val spec = hmacSpec(algorithm)
        val inner = resolveMessageDigest(spec.digestAlgorithm)
        val outer = resolveMessageDigest(spec.digestAlgorithm)
        val (ipad, opad) = hmacPads(key, spec, inner)

        inner.update(ipad)
        inner.update(bytes)
        val innerDigest = inner.digest()

        outer.update(opad)
        outer.update(innerDigest)
        return outer.digest()
    }

    private fun computeHmacForStream(
        stream: InputStream,
        algorithm: String,
        key: ByteArray
    ): ByteArray {
        val spec = hmacSpec(algorithm)
        val inner = resolveMessageDigest(spec.digestAlgorithm)
        val outer = resolveMessageDigest(spec.digestAlgorithm)
        val (ipad, opad) = hmacPads(key, spec, inner)

        inner.update(ipad)
        val buffer = ByteArray(bufferSize)
        var read: Int
        while (stream.read(buffer).also { read = it } != -1) {
            if (read > 0) {
                inner.update(buffer, 0, read)
            }
        }
        val innerDigest = inner.digest()

        outer.update(opad)
        outer.update(innerDigest)
        return outer.digest()
    }

    private fun hmacPads(
        key: ByteArray,
        spec: HmacSpec,
        digest: MessageDigest
    ): Pair<ByteArray, ByteArray> {
        val normalizedKey = if (key.size > spec.blockSize) {
            digest.update(key)
            digest.digest()
        } else {
            key
        }

        val keyBlock = ByteArray(spec.blockSize)
        normalizedKey.copyInto(keyBlock, endIndex = normalizedKey.size)

        val ipad = ByteArray(spec.blockSize)
        val opad = ByteArray(spec.blockSize)
        for (i in 0 until spec.blockSize) {
            ipad[i] = (keyBlock[i].toInt() xor 0x36).toByte()
            opad[i] = (keyBlock[i].toInt() xor 0x5c).toByte()
        }
        return Pair(ipad, opad)
    }

    private fun hashXXH3Bytes(bytes: ByteArray, is128: Boolean): String {
        val state = if (is128) NativeHasher.xxh3Init128() else NativeHasher.xxh3Init64()
        require(state != 0L) { "Failed to allocate XXH3 state" }
        try {
            if (is128) {
                NativeHasher.xxh3Update128(state, bytes, bytes.size)
                return toHex(NativeHasher.xxh3Digest128(state))
            }

            NativeHasher.xxh3Update64(state, bytes, bytes.size)
            return NativeHasher.xxh3Digest64(state).toULong().toString(16).padStart(16, '0')
        } finally {
            NativeHasher.xxh3Free(state)
        }
    }

    private fun hashBlake3Bytes(bytes: ByteArray): String {
        val state = NativeHasher.blake3Init()
        require(state != 0L) { "Failed to allocate BLAKE3 state" }
        try {
            NativeHasher.blake3Update(state, bytes, bytes.size)
            return toHex(NativeHasher.blake3Digest(state))
        } finally {
            NativeHasher.blake3Free(state)
        }
    }

    private fun hashBlake3BytesKeyed(bytes: ByteArray, key: ByteArray): String {
        val state = NativeHasher.blake3InitKeyed(key)
        require(state != 0L) { "Failed to allocate BLAKE3 keyed state" }
        try {
            NativeHasher.blake3Update(state, bytes, bytes.size)
            return toHex(NativeHasher.blake3Digest(state))
        } finally {
            NativeHasher.blake3Free(state)
        }
    }
}
