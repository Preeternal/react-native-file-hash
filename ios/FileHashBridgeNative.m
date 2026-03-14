#import "FileHashBridgeNative.h"

#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
#if __has_include(<FileHash/FileHash-Swift.h>)
#import <FileHash/FileHash-Swift.h>
#elif __has_include("FileHash-Swift.h")
#import "FileHash-Swift.h"
#else
#error "FileHash-Swift.h not found; ensure Swift header is generated and exposed by CocoaPods"
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
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  [_impl fileHash:filePath algorithm:algorithm options:options resolve:resolve reject:reject];
}

- (void)stringHash:(NSString *)text
         algorithm:(NSString *)algorithm
          encoding:(NSString *)encoding
           options:(NSDictionary *)options
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  [_impl stringHash:text
          algorithm:algorithm
           encoding:encoding
            options:options
            resolve:resolve
             reject:reject];
}

- (void)invalidate
{
  [_impl invalidate];
}

@end
#endif
