package com.preeternal.filehash

import com.facebook.react.bridge.*
import com.preeternal.filehash.FileHashSpec
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

@Suppress("unused")
class FileHashModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext), FileHashSpec {

    override fun getName(): String = "FileHash"

    @ReactMethod
    override fun getFileSha256(filePath: String, promise: Promise) {
        hashFile(filePath, "SHA-256", promise)
    }

    @ReactMethod
    override fun md5Hash(filePath: String, promise: Promise) {
        hashFile(filePath, "MD5", promise)
    }

    private fun hashFile(filePath: String, algorithm: String, promise: Promise) {
        try {
            val file = File(filePath)
            val digest = MessageDigest.getInstance(algorithm)
            val buffer = ByteArray(4096)
            val inputStream = FileInputStream(file)

            inputStream.use { stream ->
                var bytesRead = stream.read(buffer)
                while (bytesRead != -1) {
                    digest.update(buffer, 0, bytesRead)
                    bytesRead = stream.read(buffer)
                }
            }

            val hashBytes = digest.digest()
            val hashString = hashBytes.joinToString("") { "%02x".format(it) }
            promise.resolve(hashString)

        } catch (e: Exception) {
            promise.reject("E_HASH_FAILED", "Failed to compute hash", e)
        }
    }
}