import Foundation
import XCTest
@testable import FileHashTestSupport

final class FileHashOperationRegistryTests: XCTestCase {
    func testCompletionOfOldOperationDoesNotClearNewCancellationState() {
        let registry = FileHashOperationRegistry()
        let operationId = "file-hash:test"
        let oldOperation = BlockOperation()
        let newOperation = BlockOperation()

        registry.register(oldOperation, id: operationId)
        registry.complete(oldOperation, id: operationId)
        registry.register(newOperation, id: operationId)
        registry.cancel(id: operationId)

        registry.complete(oldOperation, id: operationId)

        XCTAssertTrue(registry.isCancelled(id: operationId))
        XCTAssertFalse(newOperation.isCancelled)

        registry.complete(newOperation, id: operationId)
        XCTAssertFalse(registry.isCancelled(id: operationId))
    }

    func testCancellationBeforeRegistrationPreservesMarkerUntilCompletion() {
        let registry = FileHashOperationRegistry()
        let operation = BlockOperation()

        registry.cancel(id: "file-hash:pending")
        registry.register(operation, id: "file-hash:pending")

        XCTAssertFalse(operation.isCancelled)
        XCTAssertTrue(registry.isCancelled(id: "file-hash:pending"))

        registry.complete(operation, id: "file-hash:pending")
        XCTAssertFalse(registry.isCancelled(id: "file-hash:pending"))
    }

    func testQueuedCancellationStillRunsTheWorkThatRejectsThePromise() {
        assertCancelledWorkRuns(cancelBeforeRegistration: false)
    }

    func testCancellationBeforeRegistrationStillRunsTheWorkThatRejectsThePromise() {
        assertCancelledWorkRuns(cancelBeforeRegistration: true)
    }

    private func assertCancelledWorkRuns(
        cancelBeforeRegistration: Bool,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let registry = FileHashOperationRegistry()
        let operationId = "file-hash:queued"
        let queue = OperationQueue()
        queue.isSuspended = true
        let cancellationDelivered = expectation(description: "Work observes cancellation and rejects")
        cancellationDelivered.assertForOverFulfill = true
        let completed = expectation(description: "Completion cleans up cancellation state")

        // FileHashImpl checks the marker inside its work block before calling reject.
        // That block must run even when cancellation arrives before execution.
        let operation = BlockOperation {
            XCTAssertTrue(registry.isCancelled(id: operationId), file: file, line: line)
            cancellationDelivered.fulfill()
        }
        operation.completionBlock = { [weak operation] in
            guard let operation else { return }
            registry.complete(operation, id: operationId)
            completed.fulfill()
        }

        if cancelBeforeRegistration {
            registry.cancel(id: operationId)
        }
        registry.register(operation, id: operationId)
        queue.addOperation(operation)
        if !cancelBeforeRegistration {
            registry.cancel(id: operationId)
        }

        queue.isSuspended = false
        wait(for: [cancellationDelivered, completed], timeout: 3)
        XCTAssertTrue(operation.isFinished, file: file, line: line)
        XCTAssertFalse(registry.isCancelled(id: operationId), file: file, line: line)
    }
}
