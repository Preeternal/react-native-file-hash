package com.examplespm

import android.util.Log
import com.facebook.fbreact.specs.NativeBenchmarkFileSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileOutputStream

@ReactModule(name = BenchmarkFileModule.NAME)
class BenchmarkFileModule(
  reactContext: ReactApplicationContext,
) : NativeBenchmarkFileSpec(reactContext) {

  override fun createFile(sizeBytes: Double, promise: Promise) {
    try {
      val requestedSize = sizeBytes.toLong()
      if (requestedSize <= 0L) {
        promise.reject("E_INVALID_SIZE", "Benchmark file size must be positive")
        return
      }

      val directory = File(reactApplicationContext.cacheDir, "zfh-benchmark")
      if (!directory.exists() && !directory.mkdirs()) {
        promise.reject("E_CREATE_DIR", "Failed to create benchmark cache directory")
        return
      }

      val file = File(directory, "payload-$requestedSize.bin")
      if (file.exists() && file.length() == requestedSize) {
        promise.resolve(file.absolutePath)
        return
      }

      if (file.exists() && !file.delete()) {
        promise.reject("E_DELETE_FILE", "Failed to replace benchmark file")
        return
      }

      writeDeterministicFile(file, requestedSize)
      promise.resolve(file.absolutePath)
    } catch (error: Exception) {
      promise.reject("E_CREATE_FILE", "Failed to create benchmark file", error)
    }
  }

  override fun log(message: String) {
    Log.i("ZFHBenchmark", message)
  }

  private fun writeDeterministicFile(file: File, sizeBytes: Long) {
    val buffer = ByteArray(CHUNK_SIZE) { index -> (index and 0xff).toByte() }

    FileOutputStream(file, false).use { output ->
      var remaining = sizeBytes
      while (remaining > 0L) {
        val count = minOf(buffer.size.toLong(), remaining).toInt()
        output.write(buffer, 0, count)
        remaining -= count.toLong()
      }
      output.fd.sync()
    }
  }

  companion object {
    const val NAME = NativeBenchmarkFileSpec.NAME
    private const val CHUNK_SIZE = 1024 * 1024
  }
}
