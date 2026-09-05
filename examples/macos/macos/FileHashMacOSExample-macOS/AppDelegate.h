#import <Cocoa/Cocoa.h>
#import <RCTDefaultReactNativeFactoryDelegate.h>

@interface AppDelegate : RCTDefaultReactNativeFactoryDelegate <NSApplicationDelegate>

@property (nonatomic, strong) NSWindow *window;
@property (nonatomic, strong) RCTReactNativeFactory *reactNativeFactory;

@end
