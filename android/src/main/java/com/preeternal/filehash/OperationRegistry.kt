package com.preeternal.filehash

internal class OperationRegistry {
    private val lock = Any()
    private val activeOperations = mutableMapOf<String, HashOperation>()
    private val cancelledOperationIds = mutableSetOf<String>()

    fun register(operation: HashOperation) {
        val cancelImmediately = synchronized(lock) {
            activeOperations[operation.id] = operation
            cancelledOperationIds.remove(operation.id)
        }
        if (cancelImmediately) {
            operation.cancel()
        }
    }

    fun cancel(operationId: String) {
        val operation = synchronized(lock) {
            cancelledOperationIds.add(operationId)
            activeOperations[operationId]
        }
        operation?.cancel()
    }

    fun isCancelled(operationId: String): Boolean = synchronized(lock) {
        cancelledOperationIds.contains(operationId)
    }

    fun finish(operation: HashOperation) {
        synchronized(lock) {
            if (activeOperations[operation.id] === operation) {
                activeOperations.remove(operation.id)
                cancelledOperationIds.remove(operation.id)
            }
        }
    }

    fun cancelAll(): List<HashOperation> = synchronized(lock) {
        val operations = activeOperations.values.toList()
        activeOperations.clear()
        cancelledOperationIds.clear()
        operations
    }
}
