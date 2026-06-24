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
        options: HashRequestOptions,
        operation: HashOperation?
    ): String = withContext(Dispatchers.IO) {
        val key = options.key
        operation?.throwIfCancelled()
        validateHashOptionsUsage(algorithm, options)
        val result = if (isHmacAlgorithm(algorithm)) {
            hashFileHmac(filePath, algorithm, key ?: error("validated"), operation)
        } else if (algorithm == "BLAKE3" && key != null) {
            hashBlake3FileKeyed(filePath, key, operation)
        } else {
            computeHashForFile(filePath, algorithm, options.seed, operation)
        }
        operation?.throwIfCancelled()
        return@withContext result
    }

    override fun stringHash(
        bytes: ByteArray,
        algorithm: String,
        options: HashRequestOptions,
        operation: HashOperation?
    ): String {
        val key = options.key
        operation?.throwIfCancelled()
        validateHashOptionsUsage(algorithm, options)
        val result = if (isHmacAlgorithm(algorithm)) {
            hmacBytes(bytes, algorithm, key ?: error("validated"))
        } else if (algorithm == "BLAKE3" && key != null) {
            hashBlake3BytesKeyed(bytes, key)
        } else {
            computeHashForBytes(bytes, algorithm, options.seed)
        }
        operation?.throwIfCancelled()
        return result
    }

    private fun computeHashForFile(
        filePath: String,
        algorithm: String,
        seed: Long?,
        operation: HashOperation?
    ): String {
        val inputStream = openInputStream(reactContext, filePath)
        return if (operation != null) {
            operation.useCloseable(inputStream) { stream ->
                stream.use { computeHashForStream(it, algorithm, seed, operation) }
            }
        } else {
            inputStream.use { stream -> computeHashForStream(stream, algorithm, seed, null) }
        }
    }

    private fun computeHashForStream(
        stream: InputStream,
        algorithm: String,
        seed: Long?,
        operation: HashOperation?
    ): String =
            when (algorithm) {
                "XXH3-64" -> hashXXH3(stream, is128 = false, seed, operation)
                "XXH3-128" -> hashXXH3(stream, is128 = true, seed, operation)
                "BLAKE3" -> hashBlake3(stream, operation)
                "SHA-512/224" -> hashSha512tWithProviderFallback(
                    stream = stream,
                    algorithm = algorithm,
                    variant = Sha512t.Variant.SHA_512_224,
                    operation = operation
                )
                "SHA-512/256" -> hashSha512tWithProviderFallback(
                    stream = stream,
                    algorithm = algorithm,
                    variant = Sha512t.Variant.SHA_512_256,
                    operation = operation
                )
                else -> hashWithMessageDigest(stream, algorithm, operation)
            }

    private fun computeHashForBytes(
        bytes: ByteArray,
        algorithm: String,
        seed: Long?
    ): String = when (algorithm) {
        "XXH3-64" -> hashXXH3Bytes(bytes, is128 = false, seed)
        "XXH3-128" -> hashXXH3Bytes(bytes, is128 = true, seed)
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

    private fun hashFileHmac(
        filePath: String,
        algorithm: String,
        key: ByteArray,
        operation: HashOperation?
    ): String {
        val inputStream = openInputStream(reactContext, filePath)
        return if (operation != null) {
            operation.useCloseable(inputStream) { stream ->
                stream.use { hashFileHmacStream(it, algorithm, key, operation) }
            }
        } else {
            inputStream.use { stream -> hashFileHmacStream(stream, algorithm, key, null) }
        }
    }

    private fun hashFileHmacStream(
        stream: InputStream,
        algorithm: String,
        key: ByteArray,
        operation: HashOperation?
    ): String {
        if (key.isEmpty()) {
            return toHex(computeHmacForStream(stream, algorithm, key, operation))
        }

        val mac = Mac.getInstance(
            hmacJavaName(algorithm)
                ?: throw IllegalArgumentException("Unsupported HMAC algorithm: $algorithm")
        )
        mac.init(SecretKeySpec(key, mac.algorithm))
        val buffer = ByteArray(bufferSize)
        var read: Int
        operation?.throwIfCancelled()
        while (stream.read(buffer).also { read = it } != -1) {
            operation?.throwIfCancelled()
            if (read > 0) {
                mac.update(buffer, 0, read)
            }
        }
        operation?.throwIfCancelled()
        return toHex(mac.doFinal())
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

    private fun hashBlake3FileKeyed(
        filePath: String,
        key: ByteArray,
        operation: HashOperation?
    ): String {
        val inputStream = openInputStream(reactContext, filePath)
        return if (operation != null) {
            operation.useCloseable(inputStream) { stream ->
                stream.use { hashBlake3FileKeyedStream(it, key, operation) }
            }
        } else {
            inputStream.use { stream -> hashBlake3FileKeyedStream(stream, key, null) }
        }
    }

    private fun hashBlake3FileKeyedStream(
        stream: InputStream,
        key: ByteArray,
        operation: HashOperation?
    ): String {
        val state = NativeHasher.blake3InitKeyed(key)
        require(state != 0L) { "Failed to allocate BLAKE3 keyed state" }
        val buffer = ByteArray(bufferSize)
        var read: Int
        try {
            operation?.throwIfCancelled()
            while (stream.read(buffer).also { read = it } != -1) {
                operation?.throwIfCancelled()
                if (read > 0) {
                    NativeHasher.blake3Update(state, buffer, read)
                }
            }
            operation?.throwIfCancelled()
            return toHex(NativeHasher.blake3Digest(state))
        } finally {
            NativeHasher.blake3Free(state)
        }
    }

    private fun hashWithMessageDigest(
        stream: InputStream,
        algorithm: String,
        operation: HashOperation?
    ): String {
        val digest = resolveMessageDigest(algorithm)
        val buffer = ByteArray(bufferSize)
        var read: Int
        operation?.throwIfCancelled()
        while (stream.read(buffer).also { read = it } != -1) {
            operation?.throwIfCancelled()
            if (read > 0) {
                digest.update(buffer, 0, read)
            }
        }
        operation?.throwIfCancelled()
        return toHex(digest.digest())
    }

    private fun hashXXH3(
        stream: InputStream,
        is128: Boolean,
        seed: Long?,
        operation: HashOperation?
    ): String {
        val state = if (is128) {
            NativeHasher.xxh3Init128(seed ?: 0L, seed != null)
        } else {
            NativeHasher.xxh3Init64(seed ?: 0L, seed != null)
        }
        require(state != 0L) { "Failed to allocate XXH3 state" }

        val buffer = ByteArray(bufferSize)
        var read: Int
        try {
            operation?.throwIfCancelled()
            while (stream.read(buffer).also { read = it } != -1) {
                operation?.throwIfCancelled()
                if (read > 0) {
                    if (is128) {
                        NativeHasher.xxh3Update128(state, buffer, read)
                    } else {
                        NativeHasher.xxh3Update64(state, buffer, read)
                    }
                }
            }
            operation?.throwIfCancelled()

            return if (is128) {
                toHex(NativeHasher.xxh3Digest128(state))
            } else {
                NativeHasher.xxh3Digest64(state).toULong().toString(16).padStart(16, '0')
            }
        } finally {
            NativeHasher.xxh3Free(state)
        }
    }

    private fun hashBlake3(stream: InputStream, operation: HashOperation?): String {
        val state = NativeHasher.blake3Init()
        require(state != 0L) { "Failed to allocate BLAKE3 state" }

        val buffer = ByteArray(bufferSize)
        var read: Int
        try {
            operation?.throwIfCancelled()
            while (stream.read(buffer).also { read = it } != -1) {
                operation?.throwIfCancelled()
                if (read > 0) {
                    NativeHasher.blake3Update(state, buffer, read)
                }
            }
            operation?.throwIfCancelled()
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
        variant: Sha512t.Variant,
        operation: HashOperation?
    ): String {
        return try {
            hashWithMessageDigest(stream, algorithm, operation)
        } catch (_: NoSuchAlgorithmException) {
            operation?.throwIfCancelled()
            toHex(Sha512t.digestStream(stream, bufferSize, variant, operation))
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
        key: ByteArray,
        operation: HashOperation?
    ): ByteArray {
        val spec = hmacSpec(algorithm)
        val inner = resolveMessageDigest(spec.digestAlgorithm)
        val outer = resolveMessageDigest(spec.digestAlgorithm)
        val (ipad, opad) = hmacPads(key, spec, inner)

        inner.update(ipad)
        val buffer = ByteArray(bufferSize)
        var read: Int
        operation?.throwIfCancelled()
        while (stream.read(buffer).also { read = it } != -1) {
            operation?.throwIfCancelled()
            if (read > 0) {
                inner.update(buffer, 0, read)
            }
        }
        operation?.throwIfCancelled()
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

    private fun hashXXH3Bytes(bytes: ByteArray, is128: Boolean, seed: Long?): String {
        val state = if (is128) {
            NativeHasher.xxh3Init128(seed ?: 0L, seed != null)
        } else {
            NativeHasher.xxh3Init64(seed ?: 0L, seed != null)
        }
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
