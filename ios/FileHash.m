#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HashUtils, NSObject)

RCT_EXTERN_METHOD(md5Hash:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getFileSha256:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
