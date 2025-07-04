package com.preeternal.filehash

import com.facebook.react.bridge.*
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class FileHashModule(reactContext: ReactApplicationContext) : FileHashSpec(reactContext) {

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
            val fileUri = filePath.removePrefix("file://")
            val file = File(fileUri)

            if (!file.exists()) {
                promise.reject("E_FILE_NOT_FOUND", "File not found at path: $filePath")
                return
            }

            val digest = MessageDigest.getInstance(algorithm)
            FileInputStream(file).use { fis ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (fis.read(buffer).also { bytesRead = it } != -1) {
                    digest.update(buffer, 0, bytesRead)
                }
            }
            val hashBytes = digest.digest()
            val hexString = hashBytes.joinToString("") { "%02x".format(it) }
            promise.resolve(hexString)
        } catch (e: Exception) {
            promise.reject("E_HASH_FAILED", "Failed to compute hash", e)
        }
    }
    
    override fun invalidate() {}
}