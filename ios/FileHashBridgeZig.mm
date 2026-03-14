#import "FileHashBridgeZig.h"

#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
#import "FileHashBridgeHelpers.h"
#import "FileHashZigHelpers.h"

#include <vector>

@implementation FileHashBridgeZig {
  NSOperationQueue *_queue;
}

- (instancetype)init
{
  if (self = [super init]) {
    _queue = [NSOperationQueue new];
    _queue.name = @"FileHashZigQueue";
    _queue.maxConcurrentOperationCount = 2;
    _queue.qualityOfService = NSQualityOfServiceUtility;
  }
  return self;
}

- (void)fileHash:(NSString *)filePath
       algorithm:(NSString *)algorithm
         options:(NSDictionary *)options
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  if (!ZFHEnsureZigApiCompatibility(reject)) {
    return;
  }

  [_queue addOperationWithBlock:^{
    @autoreleasepool {
      NSDictionary *effectiveOptions = options ?: @{};
      if ([algorithm hasPrefix:@"HMAC-"] && effectiveOptions[@"key"] == nil) {
        NSMutableDictionary *patched = [effectiveOptions mutableCopy];
        patched[@"key"] = @"";
        effectiveOptions = patched;
      }

      zfh_algorithm parsedAlgorithm = ZFH_ALG_SHA_256;
      NSData *keyData = nil;
      zfh_options optionsValue = {};
      const zfh_options *optionsPtr = NULL;
      if (!ZFHPrepareZigRequest(
              algorithm,
              effectiveOptions,
              &parsedAlgorithm,
              &keyData,
              &optionsValue,
              &optionsPtr,
              reject)) {
        return;
      }

      NSURL *inputURL = [NSURL URLWithString:filePath];
      NSString *urlScheme = inputURL.scheme.lowercaseString;
      BOOL hasUrlContext = (inputURL != nil && urlScheme.length > 0);
      BOOL isFileUrl = (hasUrlContext && [urlScheme isEqualToString:@"file"]);
      if (hasUrlContext && !isFileUrl) {
        reject(@"E_INVALID_PATH",
               [NSString stringWithFormat:
                             @"Unsupported URL scheme '%@'. fileHash expects a local file path or file:// URL",
                             urlScheme],
               nil);
        return;
      }

      NSString *normalizedPath = ZFHNormalizePath(filePath);
      NSData *pathData = [normalizedPath dataUsingEncoding:NSUTF8StringEncoding];
      BOOL hasPathBytes = (pathData != nil && pathData.length > 0);

      const BOOL canTryDirectPath = hasPathBytes && (!hasUrlContext || isFileUrl);
      if (canTryDirectPath) {
        std::vector<uint8_t> out(zfh_max_digest_length());
        size_t written = 0;
        zfh_error err = zfh_file_hash(parsedAlgorithm,
                                      (const uint8_t *)pathData.bytes,
                                      pathData.length,
                                      optionsPtr,
                                      out.data(),
                                      out.size(),
                                      &written);
        if (err == ZFH_OK) {
          resolve(ZFHHexString(out.data(), written));
          return;
        }

        const BOOL shouldTryUrlFallback =
            hasUrlContext && isFileUrl &&
            (err == ZFH_ACCESS_DENIED || err == ZFH_FILE_NOT_FOUND || err == ZFH_INVALID_PATH ||
             err == ZFH_IO_ERROR);
        if (shouldTryUrlFallback) {
          (void)ZFHHashFileURLWithZigStreaming(
              inputURL, parsedAlgorithm, optionsPtr, resolve, reject);
          return;
        }

        ZFHRejectZigError(err, reject);
        return;
      }

      if (hasUrlContext && isFileUrl) {
        (void)ZFHHashFileURLWithZigStreaming(
            inputURL, parsedAlgorithm, optionsPtr, resolve, reject);
        return;
      }

      reject(@"E_INVALID_PATH", @"Invalid file path", nil);
    }
  }];
}

- (void)stringHash:(NSString *)text
         algorithm:(NSString *)algorithm
          encoding:(NSString *)encoding
           options:(NSDictionary *)options
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  if (!ZFHEnsureZigApiCompatibility(reject)) {
    return;
  }

  [_queue addOperationWithBlock:^{
    @autoreleasepool {
      NSDictionary *effectiveOptions = options ?: @{};
      if ([algorithm hasPrefix:@"HMAC-"] && effectiveOptions[@"key"] == nil) {
        NSMutableDictionary *patched = [effectiveOptions mutableCopy];
        patched[@"key"] = @"";
        effectiveOptions = patched;
      }

      zfh_algorithm parsedAlgorithm = ZFH_ALG_SHA_256;
      NSData *keyData = nil;
      zfh_options optionsValue = {};
      const zfh_options *optionsPtr = NULL;
      if (!ZFHPrepareZigRequest(
              algorithm,
              effectiveOptions,
              &parsedAlgorithm,
              &keyData,
              &optionsValue,
              &optionsPtr,
              reject)) {
        return;
      }

      NSString *normalizedEncoding = nil;
      NSData *inputData = ZFHDecodeInputData(text, encoding, &normalizedEncoding);
      if (inputData == nil) {
        reject(@"E_INVALID_INPUT",
               [NSString stringWithFormat:@"Invalid %@ input", normalizedEncoding],
               nil);
        return;
      }

      std::vector<uint8_t> out(zfh_max_digest_length());
      size_t written = 0;
      zfh_error err = zfh_string_hash(parsedAlgorithm,
                                      (const uint8_t *)inputData.bytes,
                                      inputData.length,
                                      optionsPtr,
                                      out.data(),
                                      out.size(),
                                      &written);
      if (err != ZFH_OK) {
        ZFHRejectZigError(err, reject);
        return;
      }

      resolve(ZFHHexString(out.data(), written));
    }
  }];
}

- (void)invalidate
{
  [_queue cancelAllOperations];
}

@end
#endif
