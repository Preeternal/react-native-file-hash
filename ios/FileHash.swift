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
    private let sha512_224InitialHash: [CC_LONG64] = [
        0x8c3d37c819544da2,
        0x73e1996689dcd4d6,
        0x1dfab7ae32ff9c82,
        0x679dd514582f9fcf,
        0x0f6d2b697bd44da8,
        0x77e36f7304c48942,
        0x3f9d85a86a1d36c8,
        0x1112e6ad91d692a1,
    ]
    private let sha512_256InitialHash: [CC_LONG64] = [
        0x22312194fc2bf72c,
        0x9f555fa3c84c64c2,
        0x2393b86b6f53b151,
        0x963877195940eabd,
        0x96283ee2a88effe3,
        0xbe5e1e2553863992,
        0x2b0199fc2c85b8aa,
        0x0eb72ddc81c52ca2,
    ]

    // Implements SHA-512/t by seeding SHA-512 with the custom IV defined for
    // SHA-512/224 and SHA-512/256. This relies on the public CC_SHA512_CTX
    // state exported by CommonCrypto because CommonCrypto/CryptoKit do not
    // provide direct initializers for these truncated SHA-512 variants.
    private func initializeSHA512Context(
        _ ctx: inout CC_SHA512_CTX,
        initialHash: [CC_LONG64]
    ) {
        CC_SHA512_Init(&ctx)
        withUnsafeMutablePointer(to: &ctx.count) { countPtr in
            countPtr.withMemoryRebound(to: CC_LONG64.self, capacity: 2) { ptr in
                ptr[0] = 0
                ptr[1] = 0
            }
        }
        withUnsafeMutablePointer(to: &ctx.hash) { hashPtr in
            hashPtr.withMemoryRebound(to: CC_LONG64.self, capacity: 8) { ptr in
                for i in 0..<8 {
                    ptr[i] = initialHash[i]
                }
            }
        }
        withUnsafeMutablePointer(to: &ctx.wbuf) { wbufPtr in
            wbufPtr.withMemoryRebound(to: CC_LONG64.self, capacity: 16) { ptr in
                for i in 0..<16 {
                    ptr[i] = 0
                }
            }
        }
    }

    private func hashDataSHA512Truncated(
        _ data: Data,
        initialHash: [CC_LONG64],
        outputLength: Int
    ) -> String {
        var ctx = CC_SHA512_CTX()
        initializeSHA512Context(&ctx, initialHash: initialHash)
        data.withUnsafeBytes { rawBuf in
            if let base = rawBuf.baseAddress, data.count > 0 {
                _ = CC_SHA512_Update(&ctx, base, CC_LONG(data.count))
            }
        }
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA512_DIGEST_LENGTH))
        CC_SHA512_Final(&digest, &ctx)
        return digest[0..<outputLength].map { String(format: "%02x", $0) }.joined()
    }

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
        case "SHA-512/224":
            return hashDataSHA512Truncated(
                data,
                initialHash: sha512_224InitialHash,
                outputLength: Int(CC_SHA224_DIGEST_LENGTH)
            )
        case "SHA-512/256":
            return hashDataSHA512Truncated(
                data,
                initialHash: sha512_256InitialHash,
                outputLength: Int(CC_SHA256_DIGEST_LENGTH)
            )
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

    private func hmacParams(for algorithm: String) -> (algo: CCHmacAlgorithm, length: Int)? {
        switch algorithm {
        case "HMAC-SHA-224":
            return (CCHmacAlgorithm(kCCHmacAlgSHA224), Int(CC_SHA224_DIGEST_LENGTH))
        case "HMAC-SHA-256":
            return (CCHmacAlgorithm(kCCHmacAlgSHA256), Int(CC_SHA256_DIGEST_LENGTH))
        case "HMAC-SHA-384":
            return (CCHmacAlgorithm(kCCHmacAlgSHA384), Int(CC_SHA384_DIGEST_LENGTH))
        case "HMAC-SHA-512":
            return (CCHmacAlgorithm(kCCHmacAlgSHA512), Int(CC_SHA512_DIGEST_LENGTH))
        case "HMAC-MD5":
            return (CCHmacAlgorithm(kCCHmacAlgMD5), Int(CC_MD5_DIGEST_LENGTH))
        case "HMAC-SHA-1":
            return (CCHmacAlgorithm(kCCHmacAlgSHA1), Int(CC_SHA1_DIGEST_LENGTH))
        default:
            return nil
        }
    }

    private func isHmacAlgorithm(_ algorithm: String) -> Bool {
        return hmacParams(for: algorithm) != nil
    }

    private func hashDataHMAC(_ data: Data, algorithm: String, key: Data) -> String? {
        guard let params = hmacParams(for: algorithm) else { return nil }
        return key.withUnsafeBytes { keyBuf in
            var digest = [UInt8](repeating: 0, count: params.length)
            CCHmac(
                params.algo,
                keyBuf.baseAddress,
                key.count,
                (data as NSData).bytes,
                data.count,
                &digest
            )
            return digest.map { String(format: "%02x", $0) }.joined()
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
        guard let params = hmacParams(for: algorithm) else { return "" }
        var ctx = CCHmacContext()
        key.withUnsafeBytes { keyBuf in
            CCHmacInit(&ctx, params.algo, keyBuf.baseAddress, key.count)
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
        var out = [UInt8](repeating: 0, count: params.length)
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

    private func processFileSHA512Truncated(
        from fileHandle: FileHandle,
        initialHash: [CC_LONG64],
        outputLength: Int
    ) -> String {
        var ctx = CC_SHA512_CTX()
        initializeSHA512Context(&ctx, initialHash: initialHash)

        while autoreleasepool(invoking: {
            let data = try? fileHandle.read(upToCount: chunkSize)
            if let data = data, !data.isEmpty {
                data.withUnsafeBytes { rawBuf in
                    if let base = rawBuf.baseAddress {
                        _ = CC_SHA512_Update(&ctx, base, CC_LONG(data.count))
                    }
                }
                return true
            }
            return false
        }) {}

        var digest = [UInt8](repeating: 0, count: Int(CC_SHA512_DIGEST_LENGTH))
        CC_SHA512_Final(&digest, &ctx)
        return digest[0..<outputLength].map { String(format: "%02x", $0) }.joined()
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

    private func parseKeyOption(_ options: NSDictionary?) -> (key: Data?, error: String?) {
        let keyEncoding = (options?["keyEncoding"] as? String ?? "utf8").lowercased()
        let keyString = options?["key"] as? String
        if let keyString = keyString {
            guard let keyData = decodeKey(keyString, encoding: keyEncoding) else {
                return (nil, "Invalid key for selected keyEncoding")
            }
            return (keyData, nil)
        }
        return (nil, nil)
    }

    private func validateKeyUsage(algorithm: String, key: Data?) -> String? {
        if isHmacAlgorithm(algorithm) {
            if key == nil {
                return "Key is required for \(algorithm)"
            }
            return nil
        }

        if algorithm == "BLAKE3" {
            if let key, key.count != 32 {
                return "BLAKE3 keyed mode requires a 32-byte key"
            }
            return nil
        }

        if key != nil {
            return "Key is only used for HMAC algorithms or BLAKE3"
        }

        return nil
    }

    @objc
    public func fileHash(_ filePath: String, algorithm: String, options: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.addOperation { [weak self] in
            guard let self = self else { return }
            let parsedKey = self.parseKeyOption(options)
            if let keyError = parsedKey.error {
                reject("E_INVALID_KEY", keyError, nil)
                return
            }
            let key = parsedKey.key
            if let validationError = self.validateKeyUsage(algorithm: algorithm, key: key) {
                reject("E_INVALID_ARGUMENT", validationError, nil)
                return
            }
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
                if self.isHmacAlgorithm(algorithm) {
                    assert(key != nil, "validateKeyUsage should guarantee non-nil key for HMAC")
                    hashString = self.processFileHMAC(
                        fileHandle: fileHandle,
                        algorithm: algorithm,
                        key: key!
                    )
                } else if algorithm == "BLAKE3", let key {
                    assert(key.count == 32, "validateKeyUsage should guarantee 32-byte key for BLAKE3 keyed mode")
                    hashString = self.processFileBLAKE3(from: fileHandle, keyedKey: key)
                } else {
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
                    case "SHA-512/224":
                        hashString = self.processFileSHA512Truncated(
                            from: fileHandle,
                            initialHash: self.sha512_224InitialHash,
                            outputLength: Int(CC_SHA224_DIGEST_LENGTH)
                        )
                    case "SHA-512/256":
                        hashString = self.processFileSHA512Truncated(
                            from: fileHandle,
                            initialHash: self.sha512_256InitialHash,
                            outputLength: Int(CC_SHA256_DIGEST_LENGTH)
                        )
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
    public func stringHash(_ text: String, algorithm: String, encoding: String?, options: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.addOperation { [weak self] in
            guard let self = self else { return }
            let parsedKey = self.parseKeyOption(options)
            if let keyError = parsedKey.error {
                reject("E_INVALID_KEY", keyError, nil)
                return
            }
            let key = parsedKey.key
            if let validationError = self.validateKeyUsage(algorithm: algorithm, key: key) {
                reject("E_INVALID_ARGUMENT", validationError, nil)
                return
            }
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

            let hashString: String?
            if self.isHmacAlgorithm(algorithm) {
                assert(key != nil, "validateKeyUsage should guarantee non-nil key for HMAC")
                hashString = self.hashDataHMAC(input, algorithm: algorithm, key: key!)
            } else if algorithm == "BLAKE3", let key {
                assert(key.count == 32, "validateKeyUsage should guarantee 32-byte key for BLAKE3 keyed mode")
                hashString = self.hashDataKeyedBlake3(input, key: key)
            } else {
                hashString = self.hashData(input, algorithm: algorithm)
            }

            guard let hashString = hashString else {
                reject("E_UNSUPPORTED_ALGORITHM", "Unsupported algorithm: \(algorithm)", nil)
                return
            }

            resolve(hashString)
        }
    }

    // Cancel tasks when the module is invalidated (if RN triggers)
    @objc
    public func invalidate() {
        queue.cancelAllOperations()
    }
}
