#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FileHash, NSObject)

RCT_EXTERN_METHOD(fileHash:(NSString *)filePath
                  algorithm:(NSString *)algorithm
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
