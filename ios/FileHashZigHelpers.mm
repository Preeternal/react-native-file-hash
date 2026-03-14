#import "FileHashZigHelpers.h"

#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
#include <vector>
#include <cstdint>
#include <cerrno>

static BOOL ZFHParseAlgorithm(NSString *algorithm, zfh_algorithm *out)
{
  if ([algorithm isEqualToString:@"SHA-224"]) {
    *out = ZFH_ALG_SHA_224;
  } else if ([algorithm isEqualToString:@"SHA-256"]) {
    *out = ZFH_ALG_SHA_256;
  } else if ([algorithm isEqualToString:@"SHA-384"]) {
    *out = ZFH_ALG_SHA_384;
  } else if ([algorithm isEqualToString:@"SHA-512"]) {
    *out = ZFH_ALG_SHA_512;
  } else if ([algorithm isEqualToString:@"SHA-512/224"]) {
    *out = ZFH_ALG_SHA_512_224;
  } else if ([algorithm isEqualToString:@"SHA-512/256"]) {
    *out = ZFH_ALG_SHA_512_256;
  } else if ([algorithm isEqualToString:@"MD5"]) {
    *out = ZFH_ALG_MD5;
  } else if ([algorithm isEqualToString:@"SHA-1"]) {
    *out = ZFH_ALG_SHA_1;
  } else if ([algorithm isEqualToString:@"XXH3-64"]) {
    *out = ZFH_ALG_XXH3_64;
  } else if ([algorithm isEqualToString:@"BLAKE3"]) {
    *out = ZFH_ALG_BLAKE3;
  } else if ([algorithm isEqualToString:@"HMAC-SHA-224"]) {
    *out = ZFH_ALG_HMAC_SHA_224;
  } else if ([algorithm isEqualToString:@"HMAC-SHA-256"]) {
    *out = ZFH_ALG_HMAC_SHA_256;
  } else if ([algorithm isEqualToString:@"HMAC-SHA-384"]) {
    *out = ZFH_ALG_HMAC_SHA_384;
  } else if ([algorithm isEqualToString:@"HMAC-SHA-512"]) {
    *out = ZFH_ALG_HMAC_SHA_512;
  } else if ([algorithm isEqualToString:@"HMAC-MD5"]) {
    *out = ZFH_ALG_HMAC_MD5;
  } else if ([algorithm isEqualToString:@"HMAC-SHA-1"]) {
    *out = ZFH_ALG_HMAC_SHA_1;
  } else {
    return NO;
  }

  return YES;
}

static BOOL ZFHIsHmacAlgorithm(zfh_algorithm algorithm)
{
  switch (algorithm) {
    case ZFH_ALG_HMAC_SHA_224:
    case ZFH_ALG_HMAC_SHA_256:
    case ZFH_ALG_HMAC_SHA_384:
    case ZFH_ALG_HMAC_SHA_512:
    case ZFH_ALG_HMAC_MD5:
    case ZFH_ALG_HMAC_SHA_1:
      return YES;
    default:
      return NO;
  }
}

static NSString *ZFHRNCodeForError(zfh_error code)
{
  switch (code) {
    case ZFH_INVALID_ARGUMENT:
      return @"E_INVALID_ARGUMENT";
    case ZFH_INVALID_ALGORITHM:
      return @"E_UNSUPPORTED_ALGORITHM";
    case ZFH_BUFFER_TOO_SMALL:
      return @"E_BUFFER_TOO_SMALL";
    case ZFH_KEY_REQUIRED:
    case ZFH_INVALID_KEY_LENGTH:
      return @"E_INVALID_KEY";
    case ZFH_FILE_NOT_FOUND:
      return @"E_FILE_NOT_FOUND";
    case ZFH_ACCESS_DENIED:
      return @"E_ACCESS_DENIED";
    case ZFH_INVALID_PATH:
      return @"E_INVALID_PATH";
    case ZFH_IO_ERROR:
      return @"E_IO_ERROR";
    case ZFH_UNKNOWN_ERROR:
    default:
      return @"E_HASH_FAILED";
  }
}

NSString *ZFHHexString(const uint8_t *bytes, size_t len)
{
  NSMutableString *hex = [NSMutableString stringWithCapacity:len * 2];
  for (size_t i = 0; i < len; i++) {
    [hex appendFormat:@"%02x", bytes[i]];
  }
  return hex;
}

static NSData *ZFHDecodeHex(NSString *hexString)
{
  NSCharacterSet *spaces = [NSCharacterSet whitespaceAndNewlineCharacterSet];
  NSString *cleaned =
      [[hexString componentsSeparatedByCharactersInSet:spaces] componentsJoinedByString:@""];
  if (cleaned.length % 2 != 0) {
    return nil;
  }

  NSMutableData *data = [NSMutableData dataWithCapacity:cleaned.length / 2];
  for (NSUInteger i = 0; i < cleaned.length; i += 2) {
    NSString *byteString = [cleaned substringWithRange:NSMakeRange(i, 2)];
    unsigned value = 0;
    NSScanner *scanner = [NSScanner scannerWithString:byteString];
    if (![scanner scanHexInt:&value] || !scanner.isAtEnd) {
      return nil;
    }
    uint8_t byte = (uint8_t)value;
    [data appendBytes:&byte length:1];
  }

  return data;
}

static NSData *ZFHDecodeKey(NSString *key, NSString *encoding)
{
  NSString *enc = [encoding lowercaseString];
  if ([enc isEqualToString:@"base64"]) {
    return [[NSData alloc] initWithBase64EncodedString:key options:0];
  }
  if ([enc isEqualToString:@"hex"]) {
    return ZFHDecodeHex(key);
  }
  return [key dataUsingEncoding:NSUTF8StringEncoding];
}

NSString *ZFHNormalizePath(NSString *filePath)
{
  NSURL *url = [NSURL URLWithString:filePath];
  if (url != nil && url.isFileURL) {
    return url.path;
  }

  NSString *raw = [filePath stringByReplacingOccurrencesOfString:@"file://" withString:@""];
  NSString *decoded = [raw stringByRemovingPercentEncoding];
  return decoded ?: raw;
}

static BOOL ZFHIsPowerOfTwo(size_t value)
{
  return value != 0 && ((value & (value - 1)) == 0);
}

static NSString *ZFHRNCodeForNSError(NSError *error)
{
  if (error == nil) {
    return @"E_HASH_FAILED";
  }

  if ([error.domain isEqualToString:NSPOSIXErrorDomain]) {
    switch (error.code) {
      case ENOENT:
        return @"E_FILE_NOT_FOUND";
      case EACCES:
      case EPERM:
        return @"E_ACCESS_DENIED";
      case ENOTDIR:
      case EISDIR:
      case EINVAL:
        return @"E_INVALID_PATH";
      default:
        return @"E_IO_ERROR";
    }
  }

  if ([error.domain isEqualToString:NSCocoaErrorDomain]) {
    switch (error.code) {
      case NSFileNoSuchFileError:
      case NSFileReadNoSuchFileError:
        return @"E_FILE_NOT_FOUND";
      case NSFileReadNoPermissionError:
      case NSFileWriteNoPermissionError:
        return @"E_ACCESS_DENIED";
      case NSFileReadInvalidFileNameError:
      case NSFileReadUnsupportedSchemeError:
        return @"E_INVALID_PATH";
      default:
        return @"E_IO_ERROR";
    }
  }

  return @"E_IO_ERROR";
}

static NSString *ZFHValidateKeyUsage(zfh_algorithm algorithm, NSData *keyData)
{
  BOOL hasKey = keyData != nil;
  if (ZFHIsHmacAlgorithm(algorithm) && !hasKey) {
    return @"Key is required for HMAC algorithms";
  }

  if (algorithm == ZFH_ALG_BLAKE3 && hasKey && keyData.length != 32) {
    return @"BLAKE3 keyed mode requires a 32-byte key";
  }

  if (!ZFHIsHmacAlgorithm(algorithm) && algorithm != ZFH_ALG_BLAKE3 && hasKey) {
    return @"Key is only used for HMAC algorithms or BLAKE3";
  }

  return nil;
}

BOOL ZFHPrepareZigRequest(NSString *algorithm,
                          NSDictionary *options,
                          zfh_algorithm *parsedAlgorithmOut,
                          NSData **keyDataOut,
                          zfh_options *optionsValueOut,
                          const zfh_options **optionsPtrOut,
                          RCTPromiseRejectBlock reject)
{
  if ([algorithm isEqualToString:@"XXH3-128"]) {
    reject(@"E_UNSUPPORTED_ALGORITHM",
           @"Algorithm 'XXH3-128' is supported only by native engine",
           nil);
    return NO;
  }

  zfh_algorithm parsedAlgorithm = ZFH_ALG_SHA_256;
  if (!ZFHParseAlgorithm(algorithm, &parsedAlgorithm)) {
    reject(@"E_UNSUPPORTED_ALGORITHM",
           [NSString stringWithFormat:@"Unsupported algorithm: %@", algorithm],
           nil);
    return NO;
  }

  NSString *rawKeyEncoding = options[@"keyEncoding"];
  NSString *keyEncoding =
      [(rawKeyEncoding != nil ? rawKeyEncoding : @"utf8") lowercaseString];
  NSString *keyString = options[@"key"];
  NSData *keyData = nil;
  if (keyString != nil) {
    keyData = ZFHDecodeKey(keyString, keyEncoding);
    if (keyData == nil) {
      reject(@"E_INVALID_KEY", @"Invalid key for selected keyEncoding", nil);
      return NO;
    }
  }

  NSString *validationError = ZFHValidateKeyUsage(parsedAlgorithm, keyData);
  if (validationError != nil) {
    reject(@"E_INVALID_ARGUMENT", validationError, nil);
    return NO;
  }

  if (parsedAlgorithmOut != NULL) {
    *parsedAlgorithmOut = parsedAlgorithm;
  }
  if (keyDataOut != NULL) {
    *keyDataOut = keyData;
  }

  if (optionsValueOut != NULL) {
    *optionsValueOut = (zfh_options){};
    optionsValueOut->struct_size = ZFH_OPTIONS_STRUCT_SIZE;
    if (keyData != nil) {
      optionsValueOut->flags |= ZFH_OPTION_HAS_KEY;
      optionsValueOut->key_ptr = (const uint8_t *)keyData.bytes;
      optionsValueOut->key_len = keyData.length;
    }
  }
  if (optionsPtrOut != NULL) {
    *optionsPtrOut = (keyData != nil && optionsValueOut != NULL) ? optionsValueOut : NULL;
  }

  return YES;
}

NSData *_Nullable ZFHDecodeInputData(NSString *text,
                                     NSString *encoding,
                                     NSString **normalizedEncodingOut)
{
  NSString *normalizedEncoding =
      [encoding.lowercaseString length] > 0 ? encoding.lowercaseString : @"utf8";
  if (normalizedEncodingOut != NULL) {
    *normalizedEncodingOut = normalizedEncoding;
  }

  if ([normalizedEncoding isEqualToString:@"base64"]) {
    return [[NSData alloc] initWithBase64EncodedString:text options:0];
  }
  return [text dataUsingEncoding:NSUTF8StringEncoding];
}

void ZFHRejectZigError(zfh_error err, RCTPromiseRejectBlock reject)
{
  NSString *message =
      [NSString stringWithUTF8String:zfh_error_message(err)] ?: @"Unknown Zig error";
  reject(ZFHRNCodeForError(err), message, nil);
}

BOOL ZFHHashFileURLWithZigStreaming(NSURL *streamURL,
                                    zfh_algorithm algorithm,
                                    const zfh_options *optionsPtr,
                                    RCTPromiseResolveBlock resolve,
                                    RCTPromiseRejectBlock reject)
{
  if (streamURL == nil) {
    reject(@"E_INVALID_PATH", @"Invalid URL for streaming fallback", nil);
    return NO;
  }

  const size_t requiredStateSize = zfh_hasher_state_size();
  const size_t requiredStateAlign = zfh_hasher_state_align();
  if (requiredStateSize == 0 || requiredStateAlign == 0 ||
      !ZFHIsPowerOfTwo(requiredStateAlign)) {
    reject(@"E_HASH_FAILED", @"Invalid Zig hasher state requirements", nil);
    return NO;
  }

  std::vector<uint8_t> stateStorage(requiredStateSize + requiredStateAlign - 1);
  const uintptr_t baseAddr = reinterpret_cast<uintptr_t>(stateStorage.data());
  const uintptr_t alignedAddr =
      (baseAddr + (requiredStateAlign - 1)) &
      ~(static_cast<uintptr_t>(requiredStateAlign - 1));
  void *statePtr = reinterpret_cast<void *>(alignedAddr);
  const size_t stateLen =
      stateStorage.size() - static_cast<size_t>(alignedAddr - baseAddr);

  zfh_error err = zfh_hasher_init_inplace(algorithm, optionsPtr, statePtr, stateLen);
  if (err != ZFH_OK) {
    ZFHRejectZigError(err, reject);
    return NO;
  }

  BOOL didStartSecurityScope = NO;
  if (streamURL.isFileURL &&
      [streamURL respondsToSelector:@selector(startAccessingSecurityScopedResource)]) {
    didStartSecurityScope = [streamURL startAccessingSecurityScopedResource];
  }

  if (streamURL.isFileURL) {
    NSNumber *isUbiquitousItem = nil;
    NSError *ubiquitousCheckError = nil;
    BOOL hasUbiquitousFlag = [streamURL getResourceValue:&isUbiquitousItem
                                                  forKey:NSURLIsUbiquitousItemKey
                                                   error:&ubiquitousCheckError];
    if (hasUbiquitousFlag && isUbiquitousItem.boolValue) {
      NSString *downloadingStatus = nil;
      (void)[streamURL getResourceValue:&downloadingStatus
                                 forKey:NSURLUbiquitousItemDownloadingStatusKey
                                  error:nil];

      const BOOL isNotDownloaded =
          downloadingStatus != nil &&
          [downloadingStatus
              isEqualToString:NSURLUbiquitousItemDownloadingStatusNotDownloaded];
      if (isNotDownloaded) {
        NSError *downloadStartError = nil;
        [[NSFileManager defaultManager] startDownloadingUbiquitousItemAtURL:streamURL
                                                                       error:&downloadStartError];
        if (didStartSecurityScope) {
          [streamURL stopAccessingSecurityScopedResource];
        }

        NSString *statusSuffix = downloadingStatus != nil
            ? [NSString stringWithFormat:@" (status: %@)", downloadingStatus]
            : @"";
        NSString *message = downloadStartError != nil
            ? [NSString stringWithFormat:
                            @"iCloud item is not available locally%@. Failed to start download: %@",
                            statusSuffix,
                            downloadStartError.localizedDescription ?: @"unknown error"]
            : [NSString stringWithFormat:
                            @"iCloud item is not available locally%@. Download started; retry hashing after download completes",
                            statusSuffix];
        reject(downloadStartError != nil ? ZFHRNCodeForNSError(downloadStartError)
                                         : @"E_IO_ERROR",
               message,
               downloadStartError);
        return NO;
      }
    } else if (!hasUbiquitousFlag && ubiquitousCheckError != nil) {
      if (didStartSecurityScope) {
        [streamURL stopAccessingSecurityScopedResource];
      }
      reject(ZFHRNCodeForNSError(ubiquitousCheckError),
             ubiquitousCheckError.localizedDescription ?: @"Failed to inspect file URL metadata",
             ubiquitousCheckError);
      return NO;
    }
  }

  __block zfh_error hashingError = ZFH_OK;
  __block NSError *streamReadError = nil;
  __block NSString *customErrorCode = nil;
  __block NSString *customErrorMessage = nil;
  __block NSString *hexResult = nil;

  NSFileCoordinator *coordinator = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
  NSError *coordinationError = nil;
  [coordinator coordinateReadingItemAtURL:streamURL
                                  options:NSFileCoordinatorReadingWithoutChanges
                                    error:&coordinationError
                               byAccessor:^(NSURL *_Nonnull coordinatedURL) {
    NSInputStream *stream = [NSInputStream inputStreamWithURL:coordinatedURL];
    if (stream == nil) {
      customErrorCode = @"E_INVALID_PATH";
      customErrorMessage = [NSString
          stringWithFormat:@"Cannot open coordinated URL stream: %@",
                           coordinatedURL.absoluteString ?: streamURL.absoluteString];
      return;
    }

    [stream open];
    @try {
      uint8_t chunk[64 * 1024] = {0};
      while (true) {
        NSInteger read = [stream read:chunk maxLength:sizeof(chunk)];
        if (read > 0) {
          hashingError = zfh_hasher_update(statePtr, stateLen, chunk, (size_t)read);
          if (hashingError != ZFH_OK) {
            return;
          }
          continue;
        }
        if (read == 0) {
          break;
        }

        streamReadError = stream.streamError;
        return;
      }

      std::vector<uint8_t> out(zfh_max_digest_length());
      size_t written = 0;
      hashingError = zfh_hasher_final(statePtr, stateLen, out.data(), out.size(), &written);
      if (hashingError != ZFH_OK) {
        return;
      }

      hexResult = ZFHHexString(out.data(), written);
    } @finally {
      [stream close];
    }
  }];

  if (didStartSecurityScope) {
    [streamURL stopAccessingSecurityScopedResource];
  }

  if (hexResult != nil) {
    resolve(hexResult);
    return YES;
  }

  if (customErrorCode != nil) {
    reject(customErrorCode, customErrorMessage ?: @"Invalid URL stream", nil);
    return NO;
  }

  if (hashingError != ZFH_OK) {
    ZFHRejectZigError(hashingError, reject);
    return NO;
  }

  if (streamReadError != nil) {
    reject(ZFHRNCodeForNSError(streamReadError),
           streamReadError.localizedDescription ?: @"Failed to read URL stream",
           streamReadError);
    return NO;
  }

  if (coordinationError != nil) {
    reject(ZFHRNCodeForNSError(coordinationError),
           coordinationError.localizedDescription ?: @"Failed to coordinate URL read",
           coordinationError);
    return NO;
  }

  reject(@"E_IO_ERROR", @"Failed to hash coordinated URL", nil);
  return NO;
}
#endif
