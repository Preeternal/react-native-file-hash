#import <Foundation/Foundation.h>
#import "FileHashPromiseTypes.h"

#if defined(ZFH_SPM_DUAL_ENGINE) || !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
@interface FileHashBridgeNative : NSObject

- (void)fileHash:(NSString *)filePath
       algorithm:(NSString *)algorithm
         options:(NSDictionary *)options
     operationId:(NSString *)operationId
         resolve:(ZFHPromiseResolveBlock)resolve
          reject:(ZFHPromiseRejectBlock)reject;

- (void)stringHash:(NSString *)text
         algorithm:(NSString *)algorithm
          encoding:(NSString *)encoding
           options:(NSDictionary *)options
      operationId:(NSString *)operationId
           resolve:(ZFHPromiseResolveBlock)resolve
            reject:(ZFHPromiseRejectBlock)reject;

- (void)cancelOperation:(NSString *)operationId;

- (void)invalidate;

@end
#endif
