#import "HashNative.h"

#if RCT_NEW_ARCH_ENABLED
#import <FileHashSpec/FileHashSpec.h>
@interface FileHash : NSObject <NativeFileHashSpec>
#else
#import <React/RCTBridgeModule.h>
@interface FileHash : NSObject <RCTBridgeModule>
#endif

@end
