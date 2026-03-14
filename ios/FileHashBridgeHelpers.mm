#import "FileHashBridgeHelpers.h"

#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
#import "zig_files_hash_c_api.h"
#endif

NSString *const ZFHErrorHashFailed = @"E_HASH_FAILED";
NSString *const ZFHErrorUnsupportedEngine = @"E_UNSUPPORTED_ENGINE";
NSString *const ZFHErrorIncompatibleZigApi = @"E_INCOMPATIBLE_ZIG_API";
NSString *const ZFHErrorUnavailableZigRuntime = @"E_UNAVAILABLE_ZIG_RUNTIME";

static void ZFHApplyZigVersionString(NSMutableDictionary *info)
{
#ifdef ZFH_ZIG_CORE_VERSION
  info[@"zigVersion"] = [NSString stringWithUTF8String:ZFH_ZIG_CORE_VERSION] ?: @"unknown";
#else
  info[@"zigVersion"] = @"unknown";
#endif
}

#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
static void ZFHApplyNoZigDiagnostics(NSMutableDictionary *info)
{
  info[@"zigApiVersion"] = @0;
  info[@"zigExpectedApiVersion"] = @0;
  info[@"zigApiCompatible"] = @NO;
}
#endif

#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
typedef struct {
  uint32_t runtimeVersion;
  uint32_t expectedVersion;
  BOOL compatible;
} ZFHZigApiState;

static BOOL ZFHReadZigApiState(
    ZFHZigApiState *outState,
    NSString **outErrorCode,
    NSString **outErrorMessage)
{
  static dispatch_once_t onceToken;
  static ZFHZigApiState cachedState;
  static NSString *cachedErrorCode = nil;
  static NSString *cachedErrorMessage = nil;

  dispatch_once(&onceToken, ^{
    @try {
      cachedState.runtimeVersion = zfh_api_version();
      cachedState.expectedVersion = ZFH_API_VERSION;
      cachedState.compatible = cachedState.runtimeVersion == cachedState.expectedVersion;
    } @catch (NSException *exception) {
      cachedErrorCode = ZFHErrorUnavailableZigRuntime;
      cachedErrorMessage = [NSString
          stringWithFormat:@"Failed to query Zig C API version: %@",
                           exception.reason ?: @"unknown error"];
    }
  });

  if (cachedErrorCode != nil) {
    if (outErrorCode != nil) {
      *outErrorCode = cachedErrorCode;
    }
    if (outErrorMessage != nil) {
      *outErrorMessage = cachedErrorMessage;
    }
    return NO;
  }

  if (outState != nil) {
    *outState = cachedState;
  }
  return YES;
}
#endif

NSString *ZFHCurrentEngineName(void)
{
#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
  return @"zig";
#else
  return @"native";
#endif
}

NSMutableDictionary *ZFHCreateRuntimeInfo(void)
{
  NSMutableDictionary *info = [NSMutableDictionary new];
  info[@"engine"] = ZFHCurrentEngineName();
  return info;
}

BOOL ZFHResolveRuntimeDiagnostics(
    RCTPromiseResolveBlock resolve,
    RCTPromiseRejectBlock reject)
{
  NSMutableDictionary *info = ZFHCreateRuntimeInfo();
  ZFHApplyZigVersionString(info);

#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
  ZFHZigApiState state;
  NSString *errorCode = nil;
  NSString *errorMessage = nil;
  if (!ZFHReadZigApiState(&state, &errorCode, &errorMessage)) {
    reject(errorCode ?: ZFHErrorUnavailableZigRuntime,
           errorMessage ?: @"Failed to query Zig C API version",
           nil);
    return NO;
  }

  info[@"zigApiVersion"] = @(state.runtimeVersion);
  info[@"zigExpectedApiVersion"] = @(state.expectedVersion);
  info[@"zigApiCompatible"] = @(state.compatible);
#else
  ZFHApplyNoZigDiagnostics(info);
#endif

  resolve(info);
  return YES;
}

BOOL ZFHEnsureZigApiCompatibility(RCTPromiseRejectBlock reject)
{
#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
  reject(ZFHErrorUnsupportedEngine,
         @"Engine 'zig' is selected, but this build is not compiled with Zig support",
         nil);
  return NO;
#else
  ZFHZigApiState state;
  NSString *errorCode = nil;
  NSString *errorMessage = nil;
  if (!ZFHReadZigApiState(&state, &errorCode, &errorMessage)) {
    reject(errorCode ?: ZFHErrorUnavailableZigRuntime,
           errorMessage ?: @"Failed to query Zig C API version",
           nil);
    return NO;
  }

  if (!state.compatible) {
    NSString *compatibilityError = [NSString
        stringWithFormat:@"Incompatible Zig C API version: runtime=%u expected=%u",
                         state.runtimeVersion,
                         state.expectedVersion];
    reject(ZFHErrorIncompatibleZigApi, compatibilityError, nil);
    return NO;
  }
  return YES;
#endif
}

#if RCT_NEW_ARCH_ENABLED
NSMutableDictionary *ZFHOptionsDictionaryFromCodegen(
    JS::NativeFileHash::HashOptions &options)
{
  NSMutableDictionary *opts = [NSMutableDictionary new];
  if (options.key() != nil) {
    opts[@"key"] = options.key();
  }
  if (options.keyEncoding() != nil) {
    opts[@"keyEncoding"] = options.keyEncoding();
  }
  return opts;
}
#endif
