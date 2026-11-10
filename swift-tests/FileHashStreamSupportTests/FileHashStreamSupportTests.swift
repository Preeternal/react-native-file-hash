import Foundation
import XCTest
@testable import FileHashTestSupport

final class FileHashStreamSupportTests: XCTestCase {
    private enum TestError: Error {
        case readFailed
        case cancelled
    }

    private final class ScriptedReader: FileHashChunkReadable {
        private var steps: [Result<Data?, Error>]

        init(_ steps: [Result<Data?, Error>]) {
            self.steps = steps
        }

        func read(upToCount _: Int) throws -> Data? {
            guard !steps.isEmpty else { return nil }
            return try steps.removeFirst().get()
        }
    }

    func testReadErrorsArePropagatedAfterPreviouslyConsumedChunks() {
        let reader = ScriptedReader([
            .success(Data("prefix".utf8)),
            .failure(TestError.readFailed),
        ])
        var consumed: [Data] = []

        XCTAssertThrowsError(
            try FileHashStreamSupport.forEachChunk(
                from: reader,
                chunkSize: 4,
                checkCancellation: {},
                consume: { consumed.append($0) }
            )
        ) { error in
            XCTAssertTrue(error is TestError)
        }
        XCTAssertEqual(consumed, [Data("prefix".utf8)])
    }

    func testCancellationIsCheckedBeforeEachRead() {
        let reader = ScriptedReader([
            .success(Data("first".utf8)),
            .success(Data("second".utf8)),
        ])
        var checks = 0
        var consumed: [Data] = []

        XCTAssertThrowsError(
            try FileHashStreamSupport.forEachChunk(
                from: reader,
                chunkSize: 4,
                checkCancellation: {
                    checks += 1
                    if checks == 2 {
                        throw TestError.cancelled
                    }
                },
                consume: { consumed.append($0) }
            )
        ) { error in
            XCTAssertTrue(error is TestError)
        }
        XCTAssertEqual(checks, 2)
        XCTAssertEqual(consumed, [Data("first".utf8)])
    }
}
