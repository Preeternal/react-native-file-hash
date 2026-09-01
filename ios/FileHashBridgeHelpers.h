#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

#import <FileHashSpec/FileHashSpec.h>

FOUNDATION_EXPORT NSString * _Nonnull const ZFHErrorHashFailed;
FOUNDATION_EXPORT NSString * _Nonnull const ZFHErrorUnsupportedEngine;
FOUNDATION_EXPORT NSString * _Nonnull const ZFHErrorIncompatibleZigApi;
FOUNDATION_EXPORT NSString * _Nonnull const ZFHErrorUnavailableZigRuntime;

NSString *_Nonnull ZFHCurrentEngineName(void);

NSMutableDictionary *_Nonnull ZFHCreateRuntimeInfo(void);

BOOL ZFHResolveRuntimeDiagnostics(
    RCTPromiseResolveBlock _Nonnull resolve,
    RCTPromiseRejectBlock _Nonnull reject);

BOOL ZFHEnsureZigApiCompatibility(RCTPromiseRejectBlock _Nonnull reject);

NSMutableDictionary *_Nonnull ZFHOptionsDictionaryFromCodegen(
    JS::NativeFileHash::HashOptions &options);
