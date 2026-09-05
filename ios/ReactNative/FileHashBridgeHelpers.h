#import <Foundation/Foundation.h>
#import <FileHashSpec/FileHashSpec.h>
#import "FileHashPromiseTypes.h"

FOUNDATION_EXPORT NSString * _Nonnull const ZFHErrorHashFailed;
FOUNDATION_EXPORT NSString * _Nonnull const ZFHErrorUnsupportedEngine;
FOUNDATION_EXPORT NSString * _Nonnull const ZFHErrorIncompatibleZigApi;
FOUNDATION_EXPORT NSString * _Nonnull const ZFHErrorUnavailableZigRuntime;

NSString *_Nonnull ZFHCurrentEngineName(void);

NSMutableDictionary *_Nonnull ZFHCreateRuntimeInfo(void);

BOOL ZFHResolveRuntimeDiagnostics(
    ZFHPromiseResolveBlock _Nonnull resolve,
    ZFHPromiseRejectBlock _Nonnull reject);

BOOL ZFHEnsureZigApiCompatibility(ZFHPromiseRejectBlock _Nonnull reject);

NSMutableDictionary *_Nonnull ZFHOptionsDictionaryFromCodegen(
    JS::NativeFileHash::HashOptions &options);
