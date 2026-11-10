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
        XCTAssertTrue(newOperation.isCancelled)

        registry.complete(newOperation, id: operationId)
        XCTAssertFalse(registry.isCancelled(id: operationId))
    }

    func testCancellationBeforeRegistrationCancelsTheRegisteredOperation() {
        let registry = FileHashOperationRegistry()
        let operation = BlockOperation()

        registry.cancel(id: "file-hash:pending")
        registry.register(operation, id: "file-hash:pending")

        XCTAssertTrue(operation.isCancelled)
        XCTAssertFalse(registry.isCancelled(id: "file-hash:pending"))
    }
}
