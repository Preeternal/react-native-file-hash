package com.preeternal.filehash

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.FileNotFoundException
import java.security.NoSuchAlgorithmException

@ReactModule(name = FileHashModule.NAME)
class FileHashModule(
    reactContext: ReactApplicationContext
) : NativeFileHashSpec(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val engine = BuildConfig.FILE_HASH_ENGINE.lowercase()
    private val nativeExecutor: HashEngineExecutor by lazy { NativeHashEngine(reactContext) }
    private val zigExecutor: HashEngineExecutor by lazy { ZigHashEngine(reactContext) }

    @Volatile private var zigApiChecked = false
    @Volatile private var zigApiCheckFailure: IllegalStateException? = null
    @Volatile private var zigSha2Checked = false
    @Volatile private var zigSha2Supported = true

    private data class ZigApiVersions(
        val runtime: Int,
        val expected: Int
    )

    override fun getName(): String = NAME

    @ReactMethod
    override fun getRuntimeInfo(promise: Promise) {
        try {
            val info = Arguments.createMap()
            info.putString("engine", engine)
            promise.resolve(info)
        } catch (e: Exception) {
            promise.reject(ERROR_HASH_FAILED, "Failed to get runtime info", e)
        }
    }

    @ReactMethod
    override fun getRuntimeDiagnostics(promise: Promise) {
        try {
            val info = Arguments.createMap()
            info.putString("engine", engine)
            info.putString("zigVersion", BuildConfig.FILE_HASH_ZIG_CORE_VERSION)

            if (engine == "zig") {
                val versions = readZigApiVersions()
                info.putInt("zigApiVersion", versions.runtime)
                info.putInt("zigExpectedApiVersion", versions.expected)
                info.putBoolean("zigApiCompatible", versions.runtime == versions.expected)
                info.putBoolean("zigArm64Sha2Supported", hasZigArm64Sha2Support())
            } else {
                info.putInt("zigApiVersion", 0)
                info.putInt("zigExpectedApiVersion", 0)
                info.putBoolean("zigApiCompatible", false)
            }

            promise.resolve(info)
        } catch (e: IllegalStateException) {
            if (e.cause is UnsatisfiedLinkError) {
                promise.reject(ERROR_UNAVAILABLE_ZIG_RUNTIME, e.message, e)
            } else {
                promise.reject(ERROR_HASH_FAILED, "Failed to get runtime diagnostics", e)
            }
        } catch (e: Exception) {
            promise.reject(ERROR_HASH_FAILED, "Failed to get runtime diagnostics", e)
        }
    }

    private fun readZigApiVersions(): ZigApiVersions {
        return try {
            ZigApiVersions(
                runtime = ZigHasher.apiVersion(),
                expected = ZigHasher.expectedApiVersion()
            )
        } catch (e: UnsatisfiedLinkError) {
            throw IllegalStateException(
                "Failed to load Zig native library 'filehash-native'",
                e
            )
        }
    }

    private fun ensureZigApiCompatibility() {
        if (engine != "zig") return
        if (zigApiChecked) {
            zigApiCheckFailure?.let { throw it }
            return
        }

        synchronized(this) {
            if (zigApiChecked) {
                zigApiCheckFailure?.let { throw it }
                return
            }

            zigApiCheckFailure = try {
                val versions = readZigApiVersions()
                if (versions.runtime == versions.expected) {
                    null
                } else {
                    IllegalStateException(
                        "Incompatible Zig C API version: runtime=${versions.runtime} expected=${versions.expected}"
                    )
                }
            } catch (e: IllegalStateException) {
                e
            }

            zigApiChecked = true
            zigApiCheckFailure?.let { throw it }
        }
    }

    private fun hasZigArm64Sha2Support(): Boolean {
        if (engine != "zig") return true
        if (zigSha2Checked) return zigSha2Supported

        synchronized(this) {
            if (zigSha2Checked) return zigSha2Supported

            zigSha2Supported = try {
                ZigHasher.hasArm64Sha2()
            } catch (e: UnsatisfiedLinkError) {
                throw IllegalStateException(
                    "Failed to query ARM SHA2 capability from Zig native library 'filehash-native'",
                    e
                )
            }

            zigSha2Checked = true
            return zigSha2Supported
        }
    }

    private fun shouldForceNativeSha2Fallback(algorithm: String): Boolean {
        if (algorithm !in SHA2_ACCEL_FALLBACK_ALGORITHMS) return false
        // Current shipped Android Zig prebuilts are generic (without +sha2),
        // so route SHA-2/HMAC-SHA-2 to native for stable latency.
        return true
    }

    private fun selectExecutorOrReject(
        algorithm: String,
        promise: Promise
    ): HashEngineExecutor? {
        return when (engine) {
            "native" -> nativeExecutor
            "zig" -> {
                if (algorithm == "XXH3-128") {
                    promise.reject(
                        "E_UNSUPPORTED_ALGORITHM",
                        "Algorithm 'XXH3-128' is supported only by native engine"
                    )
                    return null
                }

                try {
                    ensureZigApiCompatibility()
                } catch (e: IllegalStateException) {
                    val code =
                        if (e.cause is UnsatisfiedLinkError) {
                            ERROR_UNAVAILABLE_ZIG_RUNTIME
                        } else {
                            ERROR_INCOMPATIBLE_ZIG_API
                        }
                    promise.reject(code, e.message, e)
                    return null
                }

                try {
                    if (shouldForceNativeSha2Fallback(algorithm)) {
                        nativeExecutor
                    } else {
                        zigExecutor
                    }
                } catch (e: IllegalStateException) {
                    val code =
                        if (e.cause is UnsatisfiedLinkError) {
                            ERROR_UNAVAILABLE_ZIG_RUNTIME
                        } else {
                            ERROR_HASH_FAILED
                        }
                    promise.reject(code, e.message, e)
                    null
                }
            }
            else -> {
                promise.reject(ERROR_UNSUPPORTED_ENGINE, "Unsupported engine: '$engine'")
                null
            }
        }
    }

    @ReactMethod
    override fun fileHash(filePath: String, algorithm: String, options: ReadableMap?, promise: Promise) {
        val executor = selectExecutorOrReject(algorithm, promise) ?: return

        scope.launch {
            try {
                val key = parseKeyOption(options)
                val algo = validateAlgorithm(algorithm)
                val hex = executor.fileHash(filePath, algo, key)
                promise.resolve(hex)
            } catch (e: IllegalArgumentException) {
                promise.reject("E_INVALID_ARGUMENT", e.message, e)
            } catch (e: NoSuchAlgorithmException) {
                promise.reject("E_UNSUPPORTED_ALGORITHM", "Unsupported algorithm: $algorithm", e)
            } catch (e: FileNotFoundException) {
                promise.reject("E_FILE_NOT_FOUND", "File not found or cannot open: $filePath", e)
            } catch (ce: CancellationException) {
                promise.reject("E_CANCELLED", "Hash computation cancelled")
            } catch (e: Exception) {
                promise.reject(ERROR_HASH_FAILED, "Failed to compute hash for algorithm $algorithm", e)
            }
        }
    }

    @ReactMethod
    override fun stringHash(text: String, algorithm: String, encoding: String?, options: ReadableMap?, promise: Promise) {
        val executor = selectExecutorOrReject(algorithm, promise) ?: return

        scope.launch {
            try {
                val key = parseKeyOption(options)
                val algo = validateAlgorithm(algorithm)
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

                val hex = executor.stringHash(bytes, algo, key)
                promise.resolve(hex)
            } catch (e: IllegalArgumentException) {
                promise.reject("E_INVALID_ARGUMENT", e.message, e)
            } catch (e: NoSuchAlgorithmException) {
                promise.reject("E_UNSUPPORTED_ALGORITHM", "Unsupported algorithm: $algorithm", e)
            } catch (ce: CancellationException) {
                promise.reject("E_CANCELLED", "Hash computation cancelled")
            } catch (e: Exception) {
                promise.reject(ERROR_HASH_FAILED, "Failed to compute hash for algorithm $algorithm", e)
            }
        }
    }

    override fun invalidate() {
        super.invalidate()
        scope.cancel()
    }

    private fun validateAlgorithm(input: String): String {
        require(input in SUPPORTED_ALGORITHMS) { "Unsupported algorithm: $input" }
        return input
    }

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

    private fun parseKeyOption(options: ReadableMap?): ByteArray? {
        val keyEncoding = options?.getString("keyEncoding")?.lowercase() ?: "utf8"
        val keyString = options?.getString("key")
        return if (keyString != null) decodeKey(keyString, keyEncoding) else null
    }

    companion object {
        const val NAME = "FileHash"

        private const val ERROR_HASH_FAILED = "E_HASH_FAILED"
        private const val ERROR_UNSUPPORTED_ENGINE = "E_UNSUPPORTED_ENGINE"
        private const val ERROR_INCOMPATIBLE_ZIG_API = "E_INCOMPATIBLE_ZIG_API"
        private const val ERROR_UNAVAILABLE_ZIG_RUNTIME = "E_UNAVAILABLE_ZIG_RUNTIME"
        private val SHA2_ACCEL_FALLBACK_ALGORITHMS = setOf(
            "SHA-224",
            "SHA-256",
            "HMAC-SHA-224",
            "HMAC-SHA-256"
        )

        private val SUPPORTED_ALGORITHMS = setOf(
            "MD5",
            "SHA-1",
            "SHA-224",
            "SHA-256",
            "SHA-384",
            "SHA-512",
            "SHA-512/224",
            "SHA-512/256",
            "XXH3-64",
            "XXH3-128",
            "BLAKE3",
            "HMAC-SHA-224",
            "HMAC-SHA-256",
            "HMAC-SHA-384",
            "HMAC-SHA-512",
            "HMAC-MD5",
            "HMAC-SHA-1"
        )
    }
}
