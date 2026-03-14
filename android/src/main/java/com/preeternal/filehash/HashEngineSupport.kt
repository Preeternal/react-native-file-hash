package com.preeternal.filehash

import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.InputStream

internal const val DEFAULT_BUFFER_SIZE = 64 * 1024

internal fun hmacJavaName(algo: String): String? = when (algo) {
    "HMAC-SHA-224" -> "HmacSHA224"
    "HMAC-SHA-256" -> "HmacSHA256"
    "HMAC-SHA-384" -> "HmacSHA384"
    "HMAC-SHA-512" -> "HmacSHA512"
    "HMAC-MD5" -> "HmacMD5"
    "HMAC-SHA-1" -> "HmacSHA1"
    else -> null
}

internal fun isHmacAlgorithm(algo: String): Boolean = hmacJavaName(algo) != null

internal fun validateKeyUsage(algorithm: String, key: ByteArray?) {
    if (isHmacAlgorithm(algorithm)) {
        if (key == null) {
            throw IllegalArgumentException("Key is required for $algorithm")
        }
        return
    }

    if (algorithm == "BLAKE3") {
        if (key != null && key.size != 32) {
            throw IllegalArgumentException("BLAKE3 keyed mode requires a 32-byte key")
        }
        return
    }

    if (key != null) {
        throw IllegalArgumentException(
            "Key is only used for HMAC algorithms or BLAKE3"
        )
    }
}

internal fun toHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

internal fun openInputStream(
    reactContext: ReactApplicationContext,
    filePath: String
): InputStream {
    val uri = Uri.parse(filePath)
    return when (uri.scheme?.lowercase()) {
        null, "", "file" -> {
            val path = if (uri.scheme == "file") uri.path ?: filePath else filePath
            val file = File(path)
            if (!file.exists()) {
                throw FileNotFoundException("File not found: $filePath")
            }
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
