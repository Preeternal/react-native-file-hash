package com.preeternal.filehash

import kotlinx.coroutines.CancellationException
import java.io.Closeable
import java.util.concurrent.atomic.AtomicBoolean

internal class HashOperation(val id: String) {
    private val cancelled = AtomicBoolean(false)

    @Volatile
    private var activeCloseable: Closeable? = null

    val isCancelled: Boolean
        get() = cancelled.get()

    fun cancel() {
        cancelled.set(true)
        try {
            activeCloseable?.close()
        } catch (_: Exception) {
            // Closing is best-effort; the hashing loop will observe cancellation.
        }
    }

    fun throwIfCancelled() {
        if (cancelled.get()) {
            throw CancellationException("Hash computation cancelled")
        }
    }

    fun <T : Closeable, R> useCloseable(closeable: T, block: (T) -> R): R {
        activeCloseable = closeable
        try {
            if (cancelled.get()) {
                try {
                    closeable.close()
                } catch (_: Exception) {
                    // Ignore close errors while converting to cancellation below.
                }
                throwIfCancelled()
            }
            return block(closeable)
        } finally {
            if (activeCloseable === closeable) {
                activeCloseable = null
            }
        }
    }
}
