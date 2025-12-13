#import "FileHash.h"

// Universal include for framework/static builds; require generated Swift header
#if __has_include(<FileHash/FileHash-Swift.h>)
#import <FileHash/FileHash-Swift.h>
#elif __has_include("FileHash-Swift.h")
#import "FileHash-Swift.h"
#else
#error "FileHash-Swift.h not found; ensure Swift header is generated and exposed by CocoaPods"
#endif

@interface FileHash ()
@property(nonatomic, strong) FileHashImpl *impl;
@end

@implementation FileHash {
  FileHashImpl *_impl;
}

RCT_EXPORT_MODULE();

- (instancetype)init
{
  if (self = [super init]) {
    _impl = [FileHashImpl new];
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

#if RCT_NEW_ARCH_ENABLED

// New architecture: codegen passes HashOptions as a C++ wrapper around NSDictionary.
// Convert to a plain NSDictionary before forwarding to Swift implementation.
- (void)fileHash:(NSString *)filePath
       algorithm:(NSString *)algorithm
         options:(JS::NativeFileHash::HashOptions &)options
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  NSMutableDictionary *opts = [NSMutableDictionary new];
  if (options.mode() != nil) {
    opts[@"mode"] = options.mode();
  }
  if (options.key() != nil) {
    opts[@"key"] = options.key();
  }
  if (options.keyEncoding() != nil) {
    opts[@"keyEncoding"] = options.keyEncoding();
  }

  [_impl fileHash:filePath algorithm:algorithm options:opts resolve:resolve reject:reject];
}

- (void)hashString:(NSString *)text
         algorithm:(NSString *)algorithm
          encoding:(NSString *)encoding
           options:(JS::NativeFileHash::HashOptions &)options
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  NSMutableDictionary *opts = [NSMutableDictionary new];
  if (options.mode() != nil) {
    opts[@"mode"] = options.mode();
  }
  if (options.key() != nil) {
    opts[@"key"] = options.key();
  }
  if (options.keyEncoding() != nil) {
    opts[@"keyEncoding"] = options.keyEncoding();
  }

  [_impl hashString:text algorithm:algorithm encoding:encoding options:opts resolve:resolve reject:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeFileHashSpecJSI>(params);
}

#else

RCT_EXPORT_METHOD(fileHash
                  : (NSString *)filePath algorithm
                  : (NSString *)algorithm options
                  : (NSDictionary *)options resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [_impl fileHash:filePath algorithm:algorithm options:options resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(hashString
                  : (NSString *)text algorithm
                  : (NSString *)algorithm encoding
                  : (NSString *)encoding options
                  : (NSDictionary *)options resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [_impl hashString:text algorithm:algorithm encoding:encoding options:options resolve:resolve reject:reject];
}

#endif

- (void)invalidate
{
  [_impl invalidate];
}

@end
