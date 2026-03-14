#if !defined(ZFH_ENGINE_ZIG) || ZFH_ENGINE_ZIG != 1
#import "HashNative.h"
#endif

#if RCT_NEW_ARCH_ENABLED
#import <FileHashSpec/FileHashSpec.h>
@interface FileHash : NSObject <NativeFileHashSpec>
#else
#import <React/RCTBridgeModule.h>
@interface FileHash : NSObject <RCTBridgeModule>
#endif

@end
