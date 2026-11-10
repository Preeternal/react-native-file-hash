import Foundation

internal protocol FileHashChunkReadable {
    func read(upToCount count: Int) throws -> Data?
}

extension FileHandle: FileHashChunkReadable {}

internal enum FileHashStreamSupport {
    static func forEachChunk<Reader: FileHashChunkReadable>(
        from reader: Reader,
        chunkSize: Int,
        checkCancellation: () throws -> Void,
        consume: (Data) -> Void
    ) throws {
        precondition(chunkSize > 0)

        while try autoreleasepool(invoking: { () throws -> Bool in
            try checkCancellation()
            guard let data = try reader.read(upToCount: chunkSize), !data.isEmpty else {
                return false
            }
            consume(data)
            return true
        }) {}
    }
}
