import Foundation
import CryptoKit
import CommonCrypto
import React

@objc(FileHashImpl)
public class FileHashImpl: NSObject {
    // Task queue for controlled parallelism
    private let queue: OperationQueue = {
        let q = OperationQueue()
        q.name = "FileHashQueue"
        q.maxConcurrentOperationCount = 2
        q.qualityOfService = .utility
        return q
    }()

    private let BLAKE3_OUT_LEN = 32
    private let chunkSize = 64 * 1024

    private func hashData(_ data: Data, algorithm: String) -> String? {
        switch algorithm {
        case "MD5":
            let digest = Insecure.MD5.hash(data: data)
            return digest.map { String(format: "%02x", $0) }.joined()
        case "SHA-1":
            let digest = Insecure.SHA1.hash(data: data)
            return digest.map { String(format: "%02x", $0) }.joined()
        case "SHA-224":
            var ctx = CC_SHA256_CTX()
            CC_SHA224_Init(&ctx)
            data.withUnsafeBytes { rawBuf in
                _ = CC_SHA224_Update(&ctx, rawBuf.baseAddress, CC_LONG(data.count))
            }
            var digest = [UInt8](repeating: 0, count: Int(CC_SHA224_DIGEST_LENGTH))
            CC_SHA224_Final(&digest, &ctx)
            return digest.map { String(format: "%02x", $0) }.joined()
        case "SHA-256":
            let digest = SHA256.hash(data: data)
            return digest.map { String(format: "%02x", $0) }.joined()
        case "SHA-384":
            let digest = SHA384.hash(data: data)
            return digest.map { String(format: "%02x", $0) }.joined()
        case "SHA-512":
            let digest = SHA512.hash(data: data)
            return digest.map { String(format: "%02x", $0) }.joined()
        case "XXH3-64":
            guard let state = fh_xxh3_64_init() else { return nil }
            defer { fh_xxh3_free(state) }
            data.withUnsafeBytes { rawBuf in
                if let base = rawBuf.baseAddress {
                    fh_xxh3_64_update(state, base, data.count)
                }
            }
            let result = fh_xxh3_64_digest(state)
            return String(format: "%016llx", result)
        case "XXH3-128":
            guard let state = fh_xxh3_128_init() else { return nil }
            defer { fh_xxh3_free(state) }
            data.withUnsafeBytes { rawBuf in
                if let base = rawBuf.baseAddress {
                    fh_xxh3_128_update(state, base, data.count)
                }
            }
            var digest = [UInt64](repeating: 0, count: 2)
            digest.withUnsafeMutableBufferPointer { ptr in
                fh_xxh3_128_digest(state, ptr.baseAddress)
            }
            return String(format: "%016llx%016llx", digest[0], digest[1])
        case "BLAKE3":
            guard let state = fh_blake3_init() else { return nil }
            defer { fh_blake3_free(state) }
            data.withUnsafeBytes { rawBuf in
                if let base = rawBuf.baseAddress {
                    fh_blake3_update(state, base, data.count)
                }
            }
            var digest = [UInt8](repeating: 0, count: BLAKE3_OUT_LEN)
            digest.withUnsafeMutableBufferPointer { ptr in
                fh_blake3_digest(state, ptr.baseAddress, BLAKE3_OUT_LEN)
            }
            return digest.map { String(format: "%02x", $0) }.joined()
        default:
            return nil
        }
    }

    private func hashDataHMAC(_ data: Data, algorithm: String, key: Data) -> String? {
        switch algorithm {
        case "SHA-224":
            return key.withUnsafeBytes { keyBuf -> String? in
                var digest = [UInt8](repeating: 0, count: Int(CC_SHA224_DIGEST_LENGTH))
                CCHmac(CCHmacAlgorithm(kCCHmacAlgSHA224), keyBuf.baseAddress, key.count, (data as NSData).bytes, data.count, &digest)
                return digest.map { String(format: "%02x", $0) }.joined()
            }
        case "SHA-256":
            let mac = HMAC<SHA256>.authenticationCode(for: data, using: SymmetricKey(data: key))
            return mac.map { String(format: "%02x", $0) }.joined()
        case "SHA-384":
            let mac = HMAC<SHA384>.authenticationCode(for: data, using: SymmetricKey(data: key))
            return mac.map { String(format: "%02x", $0) }.joined()
        case "SHA-512":
            let mac = HMAC<SHA512>.authenticationCode(for: data, using: SymmetricKey(data: key))
            return mac.map { String(format: "%02x", $0) }.joined()
        default:
            return nil
        }
    }

    private func hashDataKeyedBlake3(_ data: Data, key: Data) -> String? {
        guard key.count == 32 else { return nil }
        let state = key.withUnsafeBytes { rawBuf -> UnsafeMutableRawPointer? in
            guard let base = rawBuf.bindMemory(to: UInt8.self).baseAddress else {
                return nil
            }
            return fh_blake3_init_keyed(base)
        }
        guard let state else { return nil }
        defer { fh_blake3_free(state) }
        data.withUnsafeBytes { rawBuf in
            if let base = rawBuf.baseAddress {
                fh_blake3_update(state, base, data.count)
            }
        }
        var digest = [UInt8](repeating: 0, count: BLAKE3_OUT_LEN)
        digest.withUnsafeMutableBufferPointer { ptr in
            fh_blake3_digest(state, ptr.baseAddress, BLAKE3_OUT_LEN)
        }
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func decodeKey(_ key: String, encoding: String?) -> Data? {
        let enc = (encoding ?? "utf8").lowercased()
        switch enc {
        case "utf8":
            return key.data(using: .utf8)
        case "hex":
            let cleaned = key.replacingOccurrences(of: " ", with: "")
            guard cleaned.count % 2 == 0 else { return nil }
            var data = Data(capacity: cleaned.count / 2)
            var idx = cleaned.startIndex
            while idx < cleaned.endIndex {
                let nextIdx = cleaned.index(idx, offsetBy: 2)
                let byteString = cleaned[idx..<nextIdx]
                if let num = UInt8(byteString, radix: 16) {
                    data.append(num)
                } else {
                    return nil
                }
                idx = nextIdx
            }
            return data
        case "base64":
            return Data(base64Encoded: key)
        default:
            return nil
        }
    }

    private func processFile<H: HashFunction>(with hasher: H, from fileHandle: FileHandle) -> String {
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

    private func processFileHMAC(fileHandle: FileHandle, algorithm: String, key: Data) -> String {
        let algo: CCHmacAlgorithm
        let length: Int
        switch algorithm {
        case "SHA-224":
            algo = CCHmacAlgorithm(kCCHmacAlgSHA224)
            length = Int(CC_SHA224_DIGEST_LENGTH)
        case "SHA-256":
            algo = CCHmacAlgorithm(kCCHmacAlgSHA256)
            length = Int(CC_SHA256_DIGEST_LENGTH)
        case "SHA-384":
            algo = CCHmacAlgorithm(kCCHmacAlgSHA384)
            length = Int(CC_SHA384_DIGEST_LENGTH)
        case "SHA-512":
            algo = CCHmacAlgorithm(kCCHmacAlgSHA512)
            length = Int(CC_SHA512_DIGEST_LENGTH)
        default:
            return ""
        }
        var ctx = CCHmacContext()
        key.withUnsafeBytes { keyBuf in
            CCHmacInit(&ctx, algo, keyBuf.baseAddress, key.count)
        }
        while autoreleasepool(invoking: {
            let data = try? fileHandle.read(upToCount: chunkSize)
            if let data = data, !data.isEmpty {
                data.withUnsafeBytes { rawBuf in
                    CCHmacUpdate(&ctx, rawBuf.baseAddress, data.count)
                }
                return true
            }
            return false
        }) {}
        var out = [UInt8](repeating: 0, count: length)
        CCHmacFinal(&ctx, &out)
        return out.map { String(format: "%02x", $0) }.joined()
    }

    // SHA-224 via CommonCrypto (CryptoKit does not provide SHA-224)
    private func processFileSHA224(from fileHandle: FileHandle) -> String {
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

    private func processFileXXH3_64(from fileHandle: FileHandle) -> String {
        guard let state = fh_xxh3_64_init() else { return "" }
        defer { fh_xxh3_free(state) }

        while autoreleasepool(invoking: {
            let data = try? fileHandle.read(upToCount: chunkSize)
            if let data = data, !data.isEmpty {
                data.withUnsafeBytes { rawBuf in
                    if let base = rawBuf.baseAddress {
                        fh_xxh3_64_update(state, base, data.count)
                    }
                }
                return true
            }
            return false
        }) {}

        let result = fh_xxh3_64_digest(state)
        return String(format: "%016llx", result)
    }

    private func processFileXXH3_128(from fileHandle: FileHandle) -> String {
        guard let state = fh_xxh3_128_init() else { return "" }
        defer { fh_xxh3_free(state) }

        while autoreleasepool(invoking: {
            let data = try? fileHandle.read(upToCount: chunkSize)
            if let data = data, !data.isEmpty {
                data.withUnsafeBytes { rawBuf in
                    if let base = rawBuf.baseAddress {
                        fh_xxh3_128_update(state, base, data.count)
                    }
                }
                return true
            }
            return false
        }) {}

        var digest = [UInt64](repeating: 0, count: 2)
        digest.withUnsafeMutableBufferPointer { ptr in
            fh_xxh3_128_digest(state, ptr.baseAddress)
        }
        return String(format: "%016llx%016llx", digest[0], digest[1])
    }

    private func processFileBLAKE3(from fileHandle: FileHandle, keyedKey: Data? = nil) -> String {
        let state: UnsafeMutableRawPointer?
        if let keyed = keyedKey, keyed.count == 32 {
            state = keyed.withUnsafeBytes { rawBuf -> UnsafeMutableRawPointer? in
                guard let base = rawBuf.bindMemory(to: UInt8.self).baseAddress else {
                    return nil
                }
                return fh_blake3_init_keyed(base)
            }
        } else {
            state = fh_blake3_init()
        }

        guard let state else { return "" }
        defer { fh_blake3_free(state) }

        while autoreleasepool(invoking: {
            let data = try? fileHandle.read(upToCount: chunkSize)
            if let data = data, !data.isEmpty {
                data.withUnsafeBytes { rawBuf in
                    if let base = rawBuf.baseAddress {
                        fh_blake3_update(state, base, data.count)
                    }
                }
                return true
            }
            return false
        }) {}

        var digest = [UInt8](repeating: 0, count: BLAKE3_OUT_LEN)
        digest.withUnsafeMutableBufferPointer { ptr in
            fh_blake3_digest(state, ptr.baseAddress, BLAKE3_OUT_LEN)
        }
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func parseOptions(_ options: NSDictionary?) -> (mode: String, key: Data?, keyEncoding: String) {
        let mode = (options?["mode"] as? String ?? "hash").lowercased()
        let keyEncoding = (options?["keyEncoding"] as? String ?? "utf8").lowercased()
        let keyString = options?["key"] as? String
        var keyData: Data? = nil
        if let keyString = keyString {
            keyData = decodeKey(keyString, encoding: keyEncoding)
        }
        return (mode, keyData, keyEncoding)
    }

    @objc
    public func fileHash(_ filePath: String, algorithm: String, options: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.addOperation { [weak self] in
            guard let self = self else { return }

            let opts = self.parseOptions(options)
            // Normalize path (supports file:// and percent-encoded paths)
            let normalizedPath: String = {
                if let fileURL = URL(string: filePath), fileURL.isFileURL {
                    return fileURL.path
                }
                let raw = filePath.replacingOccurrences(of: "file://", with: "")
                return raw.removingPercentEncoding ?? raw
            }()
            let url = URL(fileURLWithPath: normalizedPath)

            guard FileManager.default.fileExists(atPath: url.path) else {
                reject("E_FILE_NOT_FOUND", "File not found at path: \(normalizedPath)", nil)
                return
            }

            do {
                let fileHandle = try FileHandle(forReadingFrom: url)
                defer { try? fileHandle.close() }

                let hashString: String
                do {
                    switch opts.mode {
                    case "hash":
                        switch algorithm {
                        case "MD5":
                            hashString = self.processFile(with: Insecure.MD5(), from: fileHandle)
                        case "SHA-1":
                            hashString = self.processFile(with: Insecure.SHA1(), from: fileHandle)
                        case "SHA-224":
                            hashString = self.processFileSHA224(from: fileHandle)
                        case "SHA-256":
                            hashString = self.processFile(with: SHA256(), from: fileHandle)
                        case "SHA-384":
                            hashString = self.processFile(with: SHA384(), from: fileHandle)
                        case "SHA-512":
                            hashString = self.processFile(with: SHA512(), from: fileHandle)
                        case "XXH3-64":
                            hashString = self.processFileXXH3_64(from: fileHandle)
                        case "XXH3-128":
                            hashString = self.processFileXXH3_128(from: fileHandle)
                        case "BLAKE3":
                            hashString = self.processFileBLAKE3(from: fileHandle)
                        default:
                            reject("E_UNSUPPORTED_ALGORITHM", "Unsupported algorithm: \(algorithm)", nil)
                            return
                        }
                    case "hmac":
                        guard let key = opts.key else {
                            reject("E_INVALID_KEY", "Key is required for HMAC mode", nil)
                            return
                        }
                        switch algorithm {
                        case "SHA-224":
                            hashString = self.processFileHMAC(fileHandle: fileHandle, algorithm: "SHA-224", key: key)
                        case "SHA-256":
                            hashString = self.processFileHMAC(fileHandle: fileHandle, algorithm: "SHA-256", key: key)
                        case "SHA-384":
                            hashString = self.processFileHMAC(fileHandle: fileHandle, algorithm: "SHA-384", key: key)
                        case "SHA-512":
                            hashString = self.processFileHMAC(fileHandle: fileHandle, algorithm: "SHA-512", key: key)
                        default:
                            reject("E_UNSUPPORTED_ALGORITHM", "HMAC is supported only for SHA-224/256/384/512", nil)
                            return
                        }
                    case "keyed":
                        guard algorithm == "BLAKE3" else {
                            reject("E_UNSUPPORTED_ALGORITHM", "Keyed mode is supported only for BLAKE3", nil)
                            return
                        }
                        guard let key = opts.key, key.count == 32 else {
                            reject("E_INVALID_KEY", "BLAKE3 keyed mode requires a 32-byte key", nil)
                            return
                        }
                        hashString = self.processFileBLAKE3(from: fileHandle, keyedKey: key)
                    default:
                        reject("E_UNSUPPORTED_MODE", "Unsupported mode: \(opts.mode)", nil)
                        return
                    }
                } catch let err {
                    reject("E_HASH_FAILED", "Failed to compute hash", err)
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

    @objc
    public func hashString(_ text: String, algorithm: String, encoding: String?, options: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.addOperation { [weak self] in
            guard let self = self else { return }
            let opts = self.parseOptions(options)
            let normalizedEncoding = (encoding ?? "utf8").lowercased()
            let data: Data?
            switch normalizedEncoding {
            case "base64":
                data = Data(base64Encoded: text)
            default:
                data = text.data(using: .utf8)
            }

            guard let input = data else {
                reject("E_INVALID_INPUT", "Invalid \(normalizedEncoding) input", nil)
                return
            }

            do {
                let hashString: String?
                switch opts.mode {
                case "hash":
                    hashString = self.hashData(input, algorithm: algorithm)
                case "hmac":
                    guard let key = opts.key else {
                        reject("E_INVALID_KEY", "Key is required for HMAC mode", nil)
                        return
                    }
                    hashString = self.hashDataHMAC(input, algorithm: algorithm, key: key)
                case "keyed":
                    guard algorithm == "BLAKE3" else {
                        reject("E_UNSUPPORTED_ALGORITHM", "Keyed mode is supported only for BLAKE3", nil)
                        return
                    }
                    guard let key = opts.key, key.count == 32 else {
                        reject("E_INVALID_KEY", "BLAKE3 keyed mode requires a 32-byte key", nil)
                        return
                    }
                    hashString = self.hashDataKeyedBlake3(input, key: key)
                default:
                    reject("E_UNSUPPORTED_MODE", "Unsupported mode: \(opts.mode)", nil)
                    return
                }

                guard let hashString = hashString else {
                    reject("E_UNSUPPORTED_ALGORITHM", "Unsupported algorithm: \(algorithm)", nil)
                    return
                }

                resolve(hashString)
            } catch let err {
                reject("E_HASH_FAILED", "Failed to compute hash", err)
            }
        }
    }

    // Cancel tasks when the module is invalidated (if RN triggers)
    @objc
    public func invalidate() {
        queue.cancelAllOperations()
    }
}
