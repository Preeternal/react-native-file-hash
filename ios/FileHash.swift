import Foundation
import CryptoKit
import CommonCrypto
import React

#if RCT_NEW_ARCH_ENABLED
    @objc
    protocol FileHashSpec: RCTBridgeModule {
        @objc
        func fileHash(_ filePath: String, algorithm: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock)
    }
#endif

@objc(FileHash)
class FileHash: NSObject, RCTBridgeModule {
    // Task queue for controlled parallelism
    private let queue: OperationQueue = {
        let q = OperationQueue()
        q.name = "FileHashQueue"
        q.maxConcurrentOperationCount = 2
        q.qualityOfService = .utility
        return q
    }()

#if RCT_NEW_ARCH_ENABLED
    @objc
    static func moduleName() -> String! {
        return "FileHash"
    }
#else
    static func moduleName() -> String! {
        return "FileHash"
    }
#endif

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    private func processFile<H: HashFunction>(with hasher: H, from fileHandle: FileHandle, chunkSize: Int = 64 * 1024) -> String {
        var localHasher = hasher
        while autoreleasepool(invoking: {
            let data = try? fileHandle.read(upToCount: chunkSize)
            if let data = data, !data.isEmpty {
                localHasher.update(data: data)
                return true
            }
            return false
        }) {}
        let digest = localHasher.finalize()
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    // SHA-224 via CommonCrypto (CryptoKit does not provide SHA-224)
    private func processFileSHA224(from fileHandle: FileHandle, chunkSize: Int = 64 * 1024) -> String {
        var ctx = CC_SHA256_CTX()
        CC_SHA224_Init(&ctx)
        while autoreleasepool(invoking: {
            let data = try? fileHandle.read(upToCount: chunkSize)
            if let data = data, !data.isEmpty {
                data.withUnsafeBytes { rawBuf in
                    _ = CC_SHA224_Update(&ctx, rawBuf.baseAddress, CC_LONG(data.count))
                }
                return true
            }
            return false
        }) {}
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA224_DIGEST_LENGTH))
        CC_SHA224_Final(&digest, &ctx)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    @objc
    func fileHash(_ filePath: String, algorithm: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.addOperation { [weak self] in
            guard let self = self else { return }

            // Normalize path (supports file:// and plain paths)
            let path = filePath.replacingOccurrences(of: "file://", with: "")
            let url = URL(fileURLWithPath: path)

            guard FileManager.default.fileExists(atPath: url.path) else {
                reject("E_FILE_NOT_FOUND", "File not found at path: \(path)", nil)
                return
            }

            do {
                let fileHandle = try FileHandle(forReadingFrom: url)
                defer { try? fileHandle.close() }

                let hashString: String
                switch algorithm {
                case "MD5":
                    hashString = self.processFile(with: Insecure.MD5(), from: fileHandle, chunkSize: 64 * 1024)
                case "SHA-1":
                    hashString = self.processFile(with: Insecure.SHA1(), from: fileHandle, chunkSize: 64 * 1024)
                case "SHA-224":
                    hashString = self.processFileSHA224(from: fileHandle, chunkSize: 64 * 1024)
                case "SHA-256":
                    hashString = self.processFile(with: SHA256(), from: fileHandle, chunkSize: 64 * 1024)
                case "SHA-384":
                    hashString = self.processFile(with: SHA384(), from: fileHandle, chunkSize: 64 * 1024)
                case "SHA-512":
                    hashString = self.processFile(with: SHA512(), from: fileHandle, chunkSize: 64 * 1024)
                default:
                    reject("E_UNSUPPORTED_ALGORITHM", "Unsupported algorithm: \(algorithm)", nil)
                    return
                }

                resolve(hashString)
            } catch {
                // OperationQueue has no isCancelled; cancellation can be handled
                // by using a BlockOperation and checking op.isCancelled in the loop.
                reject("E_FILE_HASH_FAILED", "Failed to read file or compute hash", error)
            }
        }
    }

    // Cancel tasks when the module is invalidated (if RN triggers)
    @objc
    func invalidate() {
        queue.cancelAllOperations()
    }
}

#if RCT_NEW_ARCH_ENABLED
extension FileHash: FileHashSpec {}
#endif
