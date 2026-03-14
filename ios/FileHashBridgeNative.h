#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
@interface FileHashBridgeNative : NSObject

- (void)fileHash:(NSString *)filePath
       algorithm:(NSString *)algorithm
         options:(NSDictionary *)options
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject;

- (void)stringHash:(NSString *)text
         algorithm:(NSString *)algorithm
          encoding:(NSString *)encoding
           options:(NSDictionary *)options
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject;

- (void)invalidate;

@end
#endif
