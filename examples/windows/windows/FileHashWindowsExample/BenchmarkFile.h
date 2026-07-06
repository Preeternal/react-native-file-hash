#pragma once

#include "NativeModules.h"

#include <string>

namespace winrt::FileHashWindowsExample {

REACT_MODULE(BenchmarkFile, L"BenchmarkFile")
struct BenchmarkFile {
  REACT_METHOD(createFile)
  void createFile(double sizeBytes, winrt::Microsoft::ReactNative::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(log)
  void log(std::string message) noexcept;
};

} // namespace winrt::FileHashWindowsExample
