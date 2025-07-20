package com.preeternal.filehash

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

@ReactModule(name = FileHashModule.NAME)
class FileHashModule(reactContext: ReactApplicationContext) : 
    NativeFileHashSpec(reactContext) {
    
    override fun getName(): String {
        return NAME
    }

    @ReactMethod
    override fun fileHash(filePath: String, algorithm: String, promise: Promise) {
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
            promise.reject("E_HASH_FAILED", "Failed to compute hash for algorithm $algorithm", e)
        }
    }

    companion object {
        const val NAME = "FileHash"
    }
}