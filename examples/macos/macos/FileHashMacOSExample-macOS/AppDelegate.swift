import SwiftUI
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
struct FileHashMacOSExampleApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

  var body: some Scene {
    Window("FileHashMacOSExample", id: "main") {
      ReactNativeView(factory: appDelegate.reactNativeFactory)
    }
    .defaultSize(width: 1280, height: 720)
  }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
  private let reactNativeDelegate: ReactNativeDelegate
  let reactNativeFactory: RCTReactNativeFactory

  override init() {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    super.init()
  }
}

// MARK: - React Native Delegate

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bundleURL()
  }

  override func bundleURL() -> URL? {
    let isSmokeTest = ProcessInfo.processInfo.arguments.contains(
      "--file-hash-smoke"
    )
#if DEBUG
    let bundleRoot = isSmokeTest ? "index.smoke" : "index"
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(
      forBundleRoot: bundleRoot
    )
#else
    let bundleName = isSmokeTest ? "main.smoke" : "main"
    return Bundle.main.url(forResource: bundleName, withExtension: "jsbundle")
#endif
  }
}

// MARK: - React Native SwiftUI View

struct ReactNativeView: NSViewRepresentable {
  let factory: RCTReactNativeFactory

  func makeNSView(context: Context) -> NSView {
    factory.rootViewFactory.view(withModuleName: "FileHashMacOSExample")
  }

  func updateNSView(_ nsView: NSView, context: Context) {}
}
