#include <stdint.h>

#import <Foundation/Foundation.h>
#import "ReactNative/FileHashPromiseTypes.h"

#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
#import "zig_files_hash_c_api.h"

NSString *_Nonnull ZFHHexString(const uint8_t *_Nonnull bytes, size_t len);

NSString *_Nonnull ZFHNormalizePath(NSString *_Nonnull filePath);

BOOL ZFHPrepareZigRequest(NSString *_Nonnull algorithm,
                          NSDictionary *_Nonnull options,
                          zfh_algorithm *_Nonnull parsedAlgorithmOut,
                          NSData *_Nullable *_Nonnull keyDataOut,
                          zfh_options *_Nonnull optionsValueOut,
                          const zfh_options *_Nullable *_Nonnull optionsPtrOut,
                          ZFHPromiseRejectBlock _Nonnull reject);

NSData *_Nullable ZFHDecodeInputData(NSString *_Nonnull text,
                                     NSString *_Nonnull encoding,
                                     NSString *_Nullable *_Nonnull normalizedEncodingOut);

void ZFHRejectZigError(zfh_error err, ZFHPromiseRejectBlock _Nonnull reject);

void ZFHCancelOperation(NSString *_Nonnull operationId);

BOOL ZFHIsOperationCancelled(NSString *_Nonnull operationId);

void ZFHForgetOperation(NSString *_Nonnull operationId);

BOOL ZFHHashFilePathWithZigFileHash(NSString *_Nonnull path,
                                    zfh_algorithm algorithm,
                                    const zfh_options *_Nullable optionsPtr,
                                    NSString *_Nullable operationId,
                                    ZFHPromiseResolveBlock _Nonnull resolve,
                                    ZFHPromiseRejectBlock _Nonnull reject);

BOOL ZFHHashFileURLWithZigFileHash(NSURL *_Nonnull streamURL,
                                   zfh_algorithm algorithm,
                                   const zfh_options *_Nullable optionsPtr,
                                   NSString *_Nullable operationId,
                                   ZFHPromiseResolveBlock _Nonnull resolve,
                                   ZFHPromiseRejectBlock _Nonnull reject);
#endif
