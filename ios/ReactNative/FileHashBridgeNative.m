#import "FileHashBridgeNative.h"

#if defined(ZFH_SPM_DUAL_ENGINE) || !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
#if defined(SWIFT_PACKAGE)
@import FileHashNative;
#elif __has_include(<FileHashNative/FileHashNative-Swift.h>)
#import <FileHashNative/FileHashNative-Swift.h>
#elif __has_include(<FileHash/FileHash-Swift.h>)
#import <FileHash/FileHash-Swift.h>
#elif __has_include("FileHash-Swift.h")
#import "FileHash-Swift.h"
#else
#error "FileHash Swift header not found; ensure CocoaPods or SwiftPM is configured"
#endif

@implementation FileHashBridgeNative {
  FileHashImpl *_impl;
}

- (instancetype)init
{
  if (self = [super init]) {
    _impl = [FileHashImpl new];
  }
  return self;
}

- (void)fileHash:(NSString *)filePath
       algorithm:(NSString *)algorithm
         options:(NSDictionary *)options
     operationId:(NSString *)operationId
         resolve:(ZFHPromiseResolveBlock)resolve
          reject:(ZFHPromiseRejectBlock)reject
{
  [_impl fileHash:filePath
        algorithm:algorithm
          options:options
      operationId:operationId
          resolve:resolve
           reject:reject];
}

- (void)stringHash:(NSString *)text
         algorithm:(NSString *)algorithm
          encoding:(NSString *)encoding
           options:(NSDictionary *)options
       operationId:(NSString *)operationId
           resolve:(ZFHPromiseResolveBlock)resolve
            reject:(ZFHPromiseRejectBlock)reject
{
  [_impl stringHash:text
          algorithm:algorithm
           encoding:encoding
            options:options
        operationId:operationId
            resolve:resolve
             reject:reject];
}

- (void)cancelOperation:(NSString *)operationId
{
  [_impl cancelOperation:operationId];
}

- (void)invalidate
{
  [_impl invalidate];
}

@end
#endif
