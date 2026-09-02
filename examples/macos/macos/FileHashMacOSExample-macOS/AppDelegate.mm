#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.dependencyProvider = [RCTAppDependencyProvider new];
  self.reactNativeFactory = [[RCTReactNativeFactory alloc] initWithDelegate:self];

  NSRect frame = NSMakeRect(0, 0, 1280, 720);
  self.window = [[NSWindow alloc]
      initWithContentRect:frame
                styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskResizable |
                          NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
                  backing:NSBackingStoreBuffered
                    defer:NO];
  self.window.title = @"FileHashMacOSExample";
  self.window.autorecalculatesKeyViewLoop = YES;

  [self.reactNativeFactory startReactNativeWithModuleName:@"FileHashMacOSExample"
                                                 inWindow:self.window
                                        initialProperties:@{}
                                            launchOptions:notification.userInfo];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
