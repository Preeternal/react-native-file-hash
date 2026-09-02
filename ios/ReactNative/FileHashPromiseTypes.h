#import <Foundation/Foundation.h>

// Promise callbacks shared by the native and Zig implementations.
typedef void (^ZFHPromiseResolveBlock)(id _Nullable result);
typedef void (^ZFHPromiseRejectBlock)(NSString *_Nullable code,
                                      NSString *_Nullable message,
                                      NSError *_Nullable error);
