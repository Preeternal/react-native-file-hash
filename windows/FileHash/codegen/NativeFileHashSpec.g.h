
/*
 * This file is auto-generated from a NativeModule spec file in js.
 *
 * This is a C++ Spec class that should be used with MakeTurboModuleProvider to register native modules
 * in a way that also verifies at compile time that the native module matches the interface required
 * by the TurboModule JS spec.
 */
#pragma once
// clang-format off

#include <NativeModules.h>
#include <tuple>

namespace Preeternal::FileHash {

struct FileHashSpec_HashOptions {
    std::optional<std::string> key;
    std::optional<std::string> keyEncoding;
    std::optional<std::string> seed;
};

struct FileHashSpec_RuntimeDiagnostics {
    std::string engine;
    double zigApiVersion;
    double zigExpectedApiVersion;
    bool zigApiCompatible;
    std::string zigVersion;
};

struct FileHashSpec_RuntimeInfo {
    std::string engine;
};


inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(FileHashSpec_HashOptions*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"key", &FileHashSpec_HashOptions::key},
        {L"keyEncoding", &FileHashSpec_HashOptions::keyEncoding},
        {L"seed", &FileHashSpec_HashOptions::seed},
    };
    return fieldMap;
}

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(FileHashSpec_RuntimeDiagnostics*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"engine", &FileHashSpec_RuntimeDiagnostics::engine},
        {L"zigApiVersion", &FileHashSpec_RuntimeDiagnostics::zigApiVersion},
        {L"zigExpectedApiVersion", &FileHashSpec_RuntimeDiagnostics::zigExpectedApiVersion},
        {L"zigApiCompatible", &FileHashSpec_RuntimeDiagnostics::zigApiCompatible},
        {L"zigVersion", &FileHashSpec_RuntimeDiagnostics::zigVersion},
    };
    return fieldMap;
}

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(FileHashSpec_RuntimeInfo*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"engine", &FileHashSpec_RuntimeInfo::engine},
    };
    return fieldMap;
}

struct FileHashSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto methods = std::tuple{
      Method<void(std::string, std::string, FileHashSpec_HashOptions, std::string, Promise<std::string>) noexcept>{0, L"fileHash"},
      Method<void(std::string, std::string, std::string, FileHashSpec_HashOptions, std::string, Promise<std::string>) noexcept>{1, L"stringHash"},
      Method<void(std::string) noexcept>{2, L"cancelOperation"},
      Method<void(Promise<FileHashSpec_RuntimeInfo>) noexcept>{3, L"getRuntimeInfo"},
      Method<void(Promise<FileHashSpec_RuntimeDiagnostics>) noexcept>{4, L"getRuntimeDiagnostics"},
  };

  template <class TModule>
  static constexpr void ValidateModule() noexcept {
    constexpr auto methodCheckResults = CheckMethods<TModule, FileHashSpec>();

    REACT_SHOW_METHOD_SPEC_ERRORS(
          0,
          "fileHash",
          "    REACT_METHOD(fileHash) void fileHash(std::string filePath, std::string algorithm, FileHashSpec_HashOptions && options, std::string operationId, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(fileHash) static void fileHash(std::string filePath, std::string algorithm, FileHashSpec_HashOptions && options, std::string operationId, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          1,
          "stringHash",
          "    REACT_METHOD(stringHash) void stringHash(std::string text, std::string algorithm, std::string encoding, FileHashSpec_HashOptions && options, std::string operationId, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(stringHash) static void stringHash(std::string text, std::string algorithm, std::string encoding, FileHashSpec_HashOptions && options, std::string operationId, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          2,
          "cancelOperation",
          "    REACT_METHOD(cancelOperation) void cancelOperation(std::string operationId) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(cancelOperation) static void cancelOperation(std::string operationId) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          3,
          "getRuntimeInfo",
          "    REACT_METHOD(getRuntimeInfo) void getRuntimeInfo(::React::ReactPromise<FileHashSpec_RuntimeInfo> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(getRuntimeInfo) static void getRuntimeInfo(::React::ReactPromise<FileHashSpec_RuntimeInfo> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          4,
          "getRuntimeDiagnostics",
          "    REACT_METHOD(getRuntimeDiagnostics) void getRuntimeDiagnostics(::React::ReactPromise<FileHashSpec_RuntimeDiagnostics> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(getRuntimeDiagnostics) static void getRuntimeDiagnostics(::React::ReactPromise<FileHashSpec_RuntimeDiagnostics> &&result) noexcept { /* implementation */ }\n");
  }
};

} // namespace Preeternal::FileHash
