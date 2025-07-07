import Foundation
import CryptoKit
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

    private func processFile<H: HashFunction>(with hasher: H, from fileHandle: FileHandle) -> String {
        var localHasher = hasher
        while autoreleasepool(invoking: {
            let data = try? fileHandle.read(upToCount: 4096)
            if let data = data, !data.isEmpty {
                localHasher.update(data: data)
                return true
            }
            return false
        }) {}
        let digest = localHasher.finalize()
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    @objc
    func fileHash(_ filePath: String, algorithm: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
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

            if algorithm == "MD5" {
                hashString = self.processFile(with: Insecure.MD5(), from: fileHandle)
            } else if algorithm == "SHA-256" {
                hashString = self.processFile(with: SHA256(), from: fileHandle)
            } else {
                reject("E_UNSUPPORTED_ALGORITHM", "Unsupported algorithm: \(algorithm)", nil)
                return
            }

            resolve(hashString)

        } catch {
            reject("E_FILE_HASH_FAILED", "Failed to read file or compute hash", error)
        }
    }
}

#if RCT_NEW_ARCH_ENABLED
extension FileHash: FileHashSpec {}
#endif