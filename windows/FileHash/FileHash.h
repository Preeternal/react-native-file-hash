#pragma once

#include "pch.h"
#include "resource.h"

#include "codegen/NativeFileHashSpec.g.h"
#include "NativeModules.h"

namespace winrt::Preeternal::FileHash
{

REACT_TURBO_MODULE(FileHash)
struct FileHash
{
  using ModuleSpec = ::Preeternal::FileHash::FileHashSpec;
  using HashOptions = ::Preeternal::FileHash::FileHashSpec_HashOptions;
  using RuntimeDiagnostics = ::Preeternal::FileHash::FileHashSpec_RuntimeDiagnostics;
  using RuntimeInfo = ::Preeternal::FileHash::FileHashSpec_RuntimeInfo;

  REACT_INIT(Initialize)
  void Initialize(::React::ReactContext const &reactContext) noexcept;

  REACT_METHOD(fileHash)
  void fileHash(
      std::string filePath,
      std::string algorithm,
      HashOptions &&options,
      std::string operationId,
      ::React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(stringHash)
  void stringHash(
      std::string text,
      std::string algorithm,
      std::string encoding,
      HashOptions &&options,
      std::string operationId,
      ::React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(cancelOperation)
  void cancelOperation(std::string operationId) noexcept;

  REACT_METHOD(getRuntimeInfo)
  void getRuntimeInfo(::React::ReactPromise<RuntimeInfo> &&result) noexcept;

  REACT_METHOD(getRuntimeDiagnostics)
  void getRuntimeDiagnostics(::React::ReactPromise<RuntimeDiagnostics> &&result) noexcept;

 private:
  ::React::ReactContext m_reactContext;
};

} // namespace winrt::Preeternal::FileHash
