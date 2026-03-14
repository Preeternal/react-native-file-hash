#import "FileHash.h"
#import "FileHashBridgeHelpers.h"

#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
#import "FileHashBridgeNative.h"
#endif

#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
#import "FileHashBridgeZig.h"
#endif

@implementation FileHash {
#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
  FileHashBridgeNative *_nativeBridge;
#endif
#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
  FileHashBridgeZig *_zigBridge;
#endif
}

RCT_EXPORT_MODULE();

- (instancetype)init
{
  if (self = [super init]) {
#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
    _nativeBridge = [FileHashBridgeNative new];
#endif
#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
    _zigBridge = [FileHashBridgeZig new];
#endif
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

#pragma mark - Runtime Info

- (void)getRuntimeInfoWithResolve:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject
{
  @try {
    resolve(ZFHCreateRuntimeInfo());
  } @catch (__unused NSException *exception) {
    reject(ZFHErrorHashFailed, @"Failed to get runtime info", nil);
  }
}

- (void)getRuntimeDiagnosticsWithResolve:(RCTPromiseResolveBlock)resolve
                                  reject:(RCTPromiseRejectBlock)reject
{
  @try {
    (void)ZFHResolveRuntimeDiagnostics(resolve, reject);
  } @catch (__unused NSException *exception) {
    reject(ZFHErrorHashFailed, @"Failed to get runtime diagnostics", nil);
  }
}

#pragma mark - Engine Dispatch

- (void)dispatchFileHashRequest:(NSString *)filePath
                      algorithm:(NSString *)algorithm
                        options:(NSDictionary *)options
                        resolve:(RCTPromiseResolveBlock)resolve
                         reject:(RCTPromiseRejectBlock)reject
{
  if ([ZFHCurrentEngineName() isEqualToString:@"zig"]) {
#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
    [_zigBridge fileHash:filePath
               algorithm:algorithm
                 options:options
                 resolve:resolve
                  reject:reject];
#else
    reject(ZFHErrorUnsupportedEngine,
           @"Engine 'zig' is selected, but this build is not compiled with Zig support",
           nil);
#endif
    return;
  }

#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
  [_nativeBridge fileHash:filePath
                algorithm:algorithm
                  options:options
                  resolve:resolve
                   reject:reject];
#else
  reject(ZFHErrorUnsupportedEngine,
         @"Engine 'native' is not compiled in this build",
         nil);
#endif
}

- (void)dispatchStringHashRequest:(NSString *)text
                        algorithm:(NSString *)algorithm
                         encoding:(NSString *)encoding
                          options:(NSDictionary *)options
                          resolve:(RCTPromiseResolveBlock)resolve
                           reject:(RCTPromiseRejectBlock)reject
{
  if ([ZFHCurrentEngineName() isEqualToString:@"zig"]) {
#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
    [_zigBridge stringHash:text
                 algorithm:algorithm
                  encoding:encoding
                   options:options
                   resolve:resolve
                    reject:reject];
#else
    reject(ZFHErrorUnsupportedEngine,
           @"Engine 'zig' is selected, but this build is not compiled with Zig support",
           nil);
#endif
    return;
  }

#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
  [_nativeBridge stringHash:text
                  algorithm:algorithm
                   encoding:encoding
                    options:options
                    resolve:resolve
                     reject:reject];
#else
  reject(ZFHErrorUnsupportedEngine,
         @"Engine 'native' is not compiled in this build",
         nil);
#endif
}

#pragma mark - TurboModule Bridge

#if RCT_NEW_ARCH_ENABLED

// New architecture: codegen passes HashOptions as a C++ wrapper around NSDictionary.
// Convert to a plain NSDictionary before forwarding to Swift implementation.
- (void)fileHash:(NSString *)filePath
       algorithm:(NSString *)algorithm
         options:(JS::NativeFileHash::HashOptions &)options
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  NSMutableDictionary *opts = ZFHOptionsDictionaryFromCodegen(options);
  if ([algorithm hasPrefix:@"HMAC-"] && opts[@"key"] == nil) {
    // Preserve empty-key HMAC semantics when optional string loses empty value in bridge.
    opts[@"key"] = @"";
  }
  [self dispatchFileHashRequest:filePath
                      algorithm:algorithm
                        options:opts
                        resolve:resolve
                         reject:reject];
}

- (void)stringHash:(NSString *)text
          algorithm:(NSString *)algorithm
           encoding:(NSString *)encoding
            options:(JS::NativeFileHash::HashOptions &)options
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  NSMutableDictionary *opts = ZFHOptionsDictionaryFromCodegen(options);
  if ([algorithm hasPrefix:@"HMAC-"] && opts[@"key"] == nil) {
    // Preserve empty-key HMAC semantics when optional string loses empty value in bridge.
    opts[@"key"] = @"";
  }
  [self dispatchStringHashRequest:text
                        algorithm:algorithm
                         encoding:encoding
                          options:opts
                          resolve:resolve
                           reject:reject];
}

- (void)getRuntimeInfo:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
  [self getRuntimeInfoWithResolve:resolve reject:reject];
}

- (void)getRuntimeDiagnostics:(RCTPromiseResolveBlock)resolve
                       reject:(RCTPromiseRejectBlock)reject
{
  [self getRuntimeDiagnosticsWithResolve:resolve reject:reject];
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
  [self dispatchFileHashRequest:filePath
                      algorithm:algorithm
                        options:options
                        resolve:resolve
                         reject:reject];
}

RCT_EXPORT_METHOD(stringHash
                  : (NSString *)text algorithm
                  : (NSString *)algorithm encoding
                  : (NSString *)encoding options
                  : (NSDictionary *)options resolve
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [self dispatchStringHashRequest:text
                        algorithm:algorithm
                         encoding:encoding
                          options:options
                          resolve:resolve
                           reject:reject];
}

RCT_EXPORT_METHOD(getRuntimeInfo
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [self getRuntimeInfoWithResolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getRuntimeDiagnostics
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  [self getRuntimeDiagnosticsWithResolve:resolve reject:reject];
}

#endif

- (void)invalidate
{
#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
  [_nativeBridge invalidate];
#endif
#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
  [_zigBridge invalidate];
#endif
}

@end
