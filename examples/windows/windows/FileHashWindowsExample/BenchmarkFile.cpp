#include "pch.h"
#include "BenchmarkFile.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <exception>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

constexpr uint64_t kChunkSize = 1024 * 1024;
constexpr uint64_t kMaxBenchmarkSizeBytes = 16ULL * 1024 * 1024 * 1024;

std::string wideToUtf8(std::wstring const &value) {
  if (value.empty()) {
    return {};
  }

  int requiredSize = WideCharToMultiByte(
      CP_UTF8,
      0,
      value.c_str(),
      static_cast<int>(value.size()),
      nullptr,
      0,
      nullptr,
      nullptr);
  if (requiredSize <= 0) {
    throw std::runtime_error("Failed to encode benchmark path");
  }

  std::string result(static_cast<size_t>(requiredSize), '\0');
  int written = WideCharToMultiByte(
      CP_UTF8,
      0,
      value.c_str(),
      static_cast<int>(value.size()),
      result.data(),
      requiredSize,
      nullptr,
      nullptr);
  if (written != requiredSize) {
    throw std::runtime_error("Failed to encode benchmark path");
  }

  return result;
}

std::filesystem::path benchmarkDirectory() {
  wchar_t tempPath[MAX_PATH];
  DWORD length = GetTempPathW(MAX_PATH, tempPath);
  if (length == 0 || length >= MAX_PATH) {
    throw std::runtime_error("Failed to resolve temp directory");
  }

  return std::filesystem::path(tempPath) / L"zfh-benchmark";
}

} // namespace

namespace winrt::FileHashWindowsExample {

void BenchmarkFile::createFile(
    double sizeBytesValue,
    winrt::Microsoft::ReactNative::ReactPromise<std::string> &&result) noexcept {
  try {
    if (!std::isfinite(sizeBytesValue) || sizeBytesValue <= 0 ||
        sizeBytesValue > static_cast<double>(kMaxBenchmarkSizeBytes)) {
      result.Reject("Benchmark file size is out of range");
      return;
    }

    uint64_t requestedSize = static_cast<uint64_t>(sizeBytesValue);
    std::filesystem::path directory = benchmarkDirectory();
    std::filesystem::create_directories(directory);

    std::filesystem::path filePath =
        directory / (L"payload-" + std::to_wstring(requestedSize) + L".bin");
    std::error_code ec;
    if (std::filesystem::exists(filePath, ec) && !ec) {
      auto currentSize = std::filesystem::file_size(filePath, ec);
      if (!ec && currentSize == requestedSize) {
        result.Resolve(wideToUtf8(filePath.wstring()));
        return;
      }
    }

    std::filesystem::remove(filePath, ec);

    std::ofstream stream(filePath, std::ios::binary | std::ios::trunc);
    if (!stream) {
      result.Reject("Failed to create benchmark file");
      return;
    }

    std::vector<char> chunk(static_cast<size_t>(kChunkSize));
    for (size_t index = 0; index < chunk.size(); index += 1) {
      chunk[index] = static_cast<char>(index & 0xff);
    }

    uint64_t remaining = requestedSize;
    while (remaining > 0) {
      std::streamsize writeSize =
          static_cast<std::streamsize>(std::min<uint64_t>(remaining, chunk.size()));
      stream.write(chunk.data(), writeSize);
      if (!stream) {
        result.Reject("Failed to write benchmark file");
        return;
      }
      remaining -= static_cast<uint64_t>(writeSize);
    }

    stream.flush();
    if (!stream) {
      result.Reject("Failed to flush benchmark file");
      return;
    }

    result.Resolve(wideToUtf8(filePath.wstring()));
  } catch (std::exception const &ex) {
    result.Reject(ex.what());
  } catch (...) {
    result.Reject("Unknown benchmark file error");
  }
}

void BenchmarkFile::log(std::string message) noexcept {
  message.push_back('\n');
  OutputDebugStringA(message.c_str());
}

} // namespace winrt::FileHashWindowsExample
