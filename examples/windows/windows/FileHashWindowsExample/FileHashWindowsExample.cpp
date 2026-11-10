// FileHashWindowsExample.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "FileHashWindowsExample.h"

#include "AutolinkedNativeModules.g.h"
#include "BenchmarkFile.h"

#include "NativeModules.h"

#include <exception>
#include <shellapi.h>

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
  }
};

static int RunApp() {
  // Initialize WinRT
  winrt::init_apartment(winrt::apartment_type::single_threaded);

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  // Find the path hosting the app exe file
  WCHAR appDirectory[MAX_PATH];
  GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
  PathCchRemoveFileSpec(appDirectory, MAX_PATH);

  // Create a ReactNativeWin32App with the ReactNativeAppBuilder
  auto reactNativeWin32App{winrt::Microsoft::ReactNative::ReactNativeAppBuilder().Build()};

  // Configure the initial InstanceSettings for the app's ReactNativeHost
  auto settings{reactNativeWin32App.ReactNativeHost().InstanceSettings()};
  // Register any autolinked native modules
  RegisterAutolinkedNativeModulePackages(settings.PackageProviders());
  // Register any native modules defined within this app project
  settings.PackageProviders().Append(winrt::make<CompReactPackageProvider>());

#if BUNDLE
  // Load the JS bundle from a file (not Metro):
  // Set the path (on disk) where the .bundle file is located
  settings.BundleRootPath(std::wstring(L"file://").append(appDirectory).append(L"\\Bundle\\").c_str());
  // Set the name of the bundle file (without the .bundle extension)
  settings.JavaScriptBundleFile(L"index.windows");
  // Disable hot reload
  settings.UseFastRefresh(false);
#else
  // Load the JS bundle from Metro
  settings.JavaScriptBundleFile(L"index");
  // Enable hot reload
  settings.UseFastRefresh(true);
#endif
#if _DEBUG
  // For Debug builds
  // Enable Direct Debugging of JS
  settings.UseDirectDebugger(true);
  // Enable the Developer Menu
  settings.UseDeveloperSupport(true);
#else
  // For Release builds:
  // Disable Direct Debugging of JS
  settings.UseDirectDebugger(false);
  // Disable the Developer Menu
  settings.UseDeveloperSupport(false);
#endif

  // Get the AppWindow so we can configure its initial title and size
  auto appWindow{reactNativeWin32App.AppWindow()};
  appWindow.Title(L"FileHashWindowsExample");
  appWindow.Resize({1000, 1000});

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"FileHashWindowsExample");

  // Start the app
  reactNativeWin32App.Start();
  return 0;
}

// Activation through the Windows shell does not inherit the CI process environment.
// Pass the smoke log path explicitly through the application's launch arguments.
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE, HINSTANCE, PSTR, int) {
  int argumentCount = 0;
  auto arguments = CommandLineToArgvW(GetCommandLineW(), &argumentCount);
  bool smoke = false;
  if (arguments != nullptr) {
    for (int index = 1; index + 1 < argumentCount; ++index) {
      if (std::wstring(arguments[index]) == L"--file-hash-smoke-log") {
        if (!SetEnvironmentVariableW(L"FILE_HASH_WINDOWS_SMOKE_LOG", arguments[index + 1])) {
          LocalFree(arguments);
          return 1;
        }
        smoke = true;
        break;
      }
    }
    LocalFree(arguments);
  }

  winrt::FileHashWindowsExample::BenchmarkFile logger;
  if (smoke) {
    logger.log("FILE_HASH_WINDOWS_SMOKE_NATIVE_START");
  }
  try {
    return RunApp();
  } catch (winrt::hresult_error const &error) {
    logger.log("FILE_HASH_WINDOWS_SMOKE_NATIVE_FAIL " + winrt::to_string(error.message()));
  } catch (std::exception const &error) {
    logger.log(std::string("FILE_HASH_WINDOWS_SMOKE_NATIVE_FAIL ") + error.what());
  } catch (...) {
    logger.log("FILE_HASH_WINDOWS_SMOKE_NATIVE_FAIL Unknown native startup error");
  }
  return 1;
}
