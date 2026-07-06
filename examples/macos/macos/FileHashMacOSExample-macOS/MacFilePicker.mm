#import "MacFilePicker.h"

#import <Cocoa/Cocoa.h>

@implementation MacFilePicker

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(pickFile
                  : (RCTPromiseResolveBlock)resolve reject
                  : (RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = NO;
    panel.resolvesAliases = YES;

    NSModalResponse response = [panel runModal];
    if (response != NSModalResponseOK) {
      resolve((id)kCFNull);
      return;
    }

    NSURL *url = panel.URLs.firstObject;
    if (url == nil) {
      reject(@"E_NO_FILE", @"No file selected", nil);
      return;
    }

    resolve(@{
      @"name" : url.lastPathComponent ?: @"",
      @"path" : url.path ?: @"",
      @"uri" : url.absoluteString ?: @""
    });
  });
}

@end
