#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

#if defined(ZFH_ENGINE_ZIG) && ZFH_ENGINE_ZIG == 1
@interface FileHashBridgeZig : NSObject

- (void)fileHash:(NSString *)filePath
       algorithm:(NSString *)algorithm
         options:(NSDictionary *)options
     operationId:(NSString *)operationId
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject;

- (void)stringHash:(NSString *)text
         algorithm:(NSString *)algorithm
          encoding:(NSString *)encoding
           options:(NSDictionary *)options
      operationId:(NSString *)operationId
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject;

- (void)cancelOperation:(NSString *)operationId;

- (void)invalidate;

@end
#endif
