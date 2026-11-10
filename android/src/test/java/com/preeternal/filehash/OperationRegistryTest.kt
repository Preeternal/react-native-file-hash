package com.preeternal.filehash

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OperationRegistryTest {
    @Test
    fun completionOfOldOperationDoesNotClearNewCancellationState() {
        val registry = OperationRegistry()
        val operationId = "file-hash:test"
        val oldOperation = HashOperation(operationId)
        val newOperation = HashOperation(operationId)

        registry.register(oldOperation)
        registry.finish(oldOperation)
        registry.register(newOperation)
        registry.cancel(operationId)

        registry.finish(oldOperation)

        assertTrue(registry.isCancelled(operationId))
        assertTrue(newOperation.isCancelled)

        registry.finish(newOperation)
        assertFalse(registry.isCancelled(operationId))
    }

    @Test
    fun cancellationBeforeRegistrationCancelsTheRegisteredOperation() {
        val registry = OperationRegistry()
        val operation = HashOperation("file-hash:pending")

        registry.cancel(operation.id)
        registry.register(operation)

        assertTrue(operation.isCancelled)
        assertFalse(registry.isCancelled(operation.id))
    }
}
