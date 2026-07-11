#import "FileHashBridgeZig.h"

#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
#import "FileHashBridgeHelpers.h"
#import "FileHashZigHelpers.h"

#include <vector>

@implementation FileHashBridgeZig {
  NSOperationQueue *_queue;
  NSLock *_operationsLock;
  NSMutableDictionary<NSString *, NSOperation *> *_operationsById;
}

- (instancetype)init
{
  if (self = [super init]) {
    _queue = [NSOperationQueue new];
    _queue.name = @"FileHashZigQueue";
    _queue.maxConcurrentOperationCount = 2;
    _queue.qualityOfService = NSQualityOfServiceUtility;
    _operationsLock = [NSLock new];
    _operationsById = [NSMutableDictionary new];
  }
  return self;
}

- (void)enqueueOperationWithId:(NSString *)operationId
                          work:(void (^)(NSOperation *operation))work
{
  NSString *trackedId = operationId.length > 0 ? [operationId copy] : nil;
  NSBlockOperation *operation = [NSBlockOperation new];
  __weak NSBlockOperation *weakOperation = operation;
  __weak FileHashBridgeZig *weakSelf = self;

  [operation addExecutionBlock:^{
    work(weakOperation);
  }];

  operation.completionBlock = ^{
    if (trackedId.length == 0) {
      return;
    }
    [weakSelf removeOperationWithId:trackedId operation:weakOperation];
  };

  if (trackedId.length > 0) {
    [_operationsLock lock];
    _operationsById[trackedId] = operation;
    [_operationsLock unlock];
  }

  [_queue addOperation:operation];
}

- (void)removeOperationWithId:(NSString *)operationId operation:(NSOperation *)operation
{
  if (operationId.length == 0) {
    return;
  }

  [_operationsLock lock];
  if (_operationsById[operationId] == operation) {
    [_operationsById removeObjectForKey:operationId];
  }
  [_operationsLock unlock];
  ZFHForgetOperation(operationId);
}

- (void)fileHash:(NSString *)filePath
       algorithm:(NSString *)algorithm
         options:(NSDictionary *)options
     operationId:(NSString *)operationId
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  if (!ZFHEnsureZigApiCompatibility(reject)) {
    return;
  }

  [self enqueueOperationWithId:operationId
                          work:^(NSOperation *operation) {
    @autoreleasepool {
      if (operation.cancelled || ZFHIsOperationCancelled(operationId)) {
        reject(@"E_CANCELLED", @"Hash computation cancelled", nil);
        return;
      }

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
      NSURL *streamURL = nil;
      if (hasUrlContext && isFileUrl) {
        streamURL = inputURL;
      } else if (!hasUrlContext) {
        if (operation.cancelled || ZFHIsOperationCancelled(operationId)) {
          reject(@"E_CANCELLED", @"Hash computation cancelled", nil);
          return;
        }
        (void)ZFHHashFilePathWithZigFileHash(normalizedPath,
                                             parsedAlgorithm,
                                             optionsPtr,
                                             operationId,
                                             resolve,
                                             reject);
        return;
      }

      if (streamURL != nil) {
        if (operation.cancelled || ZFHIsOperationCancelled(operationId)) {
          reject(@"E_CANCELLED", @"Hash computation cancelled", nil);
          return;
        }
        (void)ZFHHashFileURLWithZigFileHash(streamURL,
                                            parsedAlgorithm,
                                            optionsPtr,
                                            operationId,
                                            resolve,
                                            reject);
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
      operationId:(NSString *)operationId
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  if (!ZFHEnsureZigApiCompatibility(reject)) {
    return;
  }

  [self enqueueOperationWithId:operationId
                          work:^(NSOperation *operation) {
    @autoreleasepool {
      if (operation.cancelled || ZFHIsOperationCancelled(operationId)) {
        reject(@"E_CANCELLED", @"Hash computation cancelled", nil);
        return;
      }

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
      zfh_request request = {};
      request.struct_size = ZFH_REQUEST_STRUCT_SIZE;
      request.options_ptr = optionsPtr;
      const zfh_request *requestPtr = optionsPtr != NULL ? &request : NULL;
      zfh_error err = zfh_string_hash(parsedAlgorithm,
                                      (const uint8_t *)inputData.bytes,
                                      inputData.length,
                                      requestPtr,
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

- (void)cancelOperation:(NSString *)operationId
{
  if (operationId.length == 0) {
    return;
  }

  ZFHCancelOperation(operationId);
}

- (void)invalidate
{
  [_operationsLock lock];
  NSArray<NSOperation *> *operations = _operationsById.allValues;
  [_operationsById removeAllObjects];
  [_operationsLock unlock];

  for (NSOperation *operation in operations) {
    [operation cancel];
  }
  [_queue cancelAllOperations];
}

@end
#endif
