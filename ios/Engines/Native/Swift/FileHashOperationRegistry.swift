import Foundation

internal final class FileHashOperationRegistry {
    private let lock = NSLock()
    private var operationsById: [String: Operation] = [:]
    private var cancelledOperationIds = Set<String>()

    func register(_ operation: Operation, id: String) {
        lock.lock()
        operationsById[id] = operation
        lock.unlock()
    }

    func cancel(id: String) {
        lock.lock()
        cancelledOperationIds.insert(id)
        lock.unlock()
        // Cancellation is cooperative: cancelling a queued BlockOperation would
        // skip its work block, including the promise rejection in FileHashImpl.
    }

    func isCancelled(id: String) -> Bool {
        lock.lock()
        let result = cancelledOperationIds.contains(id)
        lock.unlock()
        return result
    }

    func complete(_ operation: Operation, id: String) {
        lock.lock()
        if operationsById[id] === operation {
            operationsById.removeValue(forKey: id)
            cancelledOperationIds.remove(id)
        }
        lock.unlock()
    }

    func cancelAll() -> [Operation] {
        lock.lock()
        let operations = Array(operationsById.values)
        operationsById.removeAll()
        cancelledOperationIds.removeAll()
        lock.unlock()
        return operations
    }
}
