import Foundation
import CryptoKit
import React

#if RCT_NEW_ARCH_ENABLED
    @objc
    protocol HashUtilsSpec: RCTBridgeModule {
        @objc
        func md5Hash(_ filePath: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock)

        @objc
        func getFileSha256(_ filePath: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock)
    }
#endif

@objc(HashUtils)
class HashUtils: NSObject, RCTBridgeModule {
#if RCT_NEW_ARCH_ENABLED
    @objc
    static func moduleName() -> String! {
        return "HashUtils"
    }
#else
    static func moduleName() -> String! {
        return "HashUtils"
    }
#endif

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false  // Не требует запуска на главном потоке
    }

    @objc
    func md5Hash(_ filePath: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let url = URL(fileURLWithPath: filePath)

        do {
            let fileHandle = try FileHandle(forReadingFrom: url)
            defer { try? fileHandle.close() }

            var context = Insecure.MD5()
            while autoreleasepool(invoking: {
                let data = try? fileHandle.read(upToCount: 4096)
                if let data = data, !data.isEmpty {
                    context.update(data: data)
                    return true
                }
                return false
            }) {}

            let digest = context.finalize()
            let hashString = digest.map { String(format: "%02x", $0) }.joined()
            resolve(hashString)
        } catch {
            reject("E_HASH_FAILED", "Failed to read file or compute MD5 hash", error)
        }
    }

    @objc
    func getFileSha256(_ filePath: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let url = URL(fileURLWithPath: filePath)

        do {
            let fileHandle = try FileHandle(forReadingFrom: url)
            defer { try? fileHandle.close() }

            var context = SHA256()
            while autoreleasepool(invoking: {
                let data = try? fileHandle.read(upToCount: 4096)
                if let data = data, !data.isEmpty {
                    context.update(data: data)
                    return true
                }
                return false
            }) {}

            let digest = context.finalize()
            let hashString = digest.map { String(format: "%02x", $0) }.joined()
            resolver(hashString)
        } catch {
            rejecter("E_READ_FAILED", "Failed to read file or compute hash", error)
        }
    }
}

#if RCT_NEW_ARCH_ENABLED
extension HashUtils: HashUtilsSpec {}
#endif
