#include "pch.h"

#include "FileHash.h"

#include <algorithm>
#include <array>
#include <cerrno>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#include "zig_files_hash_c_api.h"

#ifndef ZFH_ZIG_CORE_VERSION
#define ZFH_ZIG_CORE_VERSION "unknown"
#endif

namespace
{

using HashOptions = ::Preeternal::FileHash::FileHashSpec_HashOptions;
using RuntimeDiagnostics = ::Preeternal::FileHash::FileHashSpec_RuntimeDiagnostics;
using RuntimeInfo = ::Preeternal::FileHash::FileHashSpec_RuntimeInfo;

constexpr uint8_t kEmptyByte = 0;

struct PreparedRequest
{
  zfh_algorithm algorithm = ZFH_ALG_SHA_256;
  zfh_options options{};
  bool hasOptions = false;
  std::vector<uint8_t> keyStorage;
};

struct OperationState
{
  std::vector<uint8_t> storage;
  void *statePtr = nullptr;
  size_t stateLen = 0;
};

std::mutex g_operationMutex;
std::unordered_map<std::string, OperationState *> g_operations;
std::unordered_set<std::string> g_cancelledOperationIds;

std::string ToLower(std::string value)
{
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
    return static_cast<char>(std::tolower(ch));
  });
  return value;
}

bool IsPowerOfTwo(size_t value) noexcept
{
  return value != 0 && ((value & (value - 1)) == 0);
}

bool InitAlignedStorage(size_t requiredSize, size_t requiredAlign, std::vector<uint8_t> &storage, void **outPtr, size_t *outLen)
{
  if (requiredSize == 0 || requiredAlign == 0 || !IsPowerOfTwo(requiredAlign)) {
    return false;
  }

  const size_t capacity = requiredSize + requiredAlign - 1;
  storage.resize(capacity);
  const uintptr_t baseAddr = reinterpret_cast<uintptr_t>(storage.data());
  const uintptr_t alignedAddr =
      (baseAddr + (requiredAlign - 1)) & ~(static_cast<uintptr_t>(requiredAlign - 1));
  *outPtr = reinterpret_cast<void *>(alignedAddr);
  *outLen = capacity - static_cast<size_t>(alignedAddr - baseAddr);
  return true;
}

zfh_error InitOperationState(OperationState &operation)
{
  if (!InitAlignedStorage(
          zfh_operation_state_size(),
          zfh_operation_state_align(),
          operation.storage,
          &operation.statePtr,
          &operation.stateLen)) {
    return ZFH_UNKNOWN_ERROR;
  }

  return zfh_operation_init_inplace(operation.statePtr, operation.stateLen);
}

void RegisterOperation(std::string const &operationId, OperationState *operation)
{
  if (operationId.empty() || operation == nullptr) {
    return;
  }

  std::lock_guard<std::mutex> lock(g_operationMutex);
  g_operations[operationId] = operation;
  if (g_cancelledOperationIds.erase(operationId) > 0) {
    (void)zfh_operation_cancel(operation->statePtr, operation->stateLen);
  }
}

void UnregisterOperation(std::string const &operationId, OperationState *operation)
{
  if (operationId.empty()) {
    return;
  }

  std::lock_guard<std::mutex> lock(g_operationMutex);
  const auto it = g_operations.find(operationId);
  if (it != g_operations.end() && it->second == operation) {
    g_operations.erase(it);
  }
  g_cancelledOperationIds.erase(operationId);
}

void CancelOperationById(std::string const &operationId)
{
  if (operationId.empty()) {
    return;
  }

  std::lock_guard<std::mutex> lock(g_operationMutex);
  const auto it = g_operations.find(operationId);
  if (it == g_operations.end()) {
    g_cancelledOperationIds.insert(operationId);
    return;
  }

  OperationState *operation = it->second;
  if (operation != nullptr) {
    (void)zfh_operation_cancel(operation->statePtr, operation->stateLen);
  }
}

struct OperationGuard
{
  std::string operationId;
  OperationState *operation = nullptr;
  bool registered = false;

  ~OperationGuard()
  {
    if (registered) {
      UnregisterOperation(operationId, operation);
    }
  }
};

bool ParseAlgorithm(std::string const &algorithmName, zfh_algorithm *outAlgorithm)
{
  if (algorithmName == "SHA-224") {
    *outAlgorithm = ZFH_ALG_SHA_224;
  } else if (algorithmName == "SHA-256") {
    *outAlgorithm = ZFH_ALG_SHA_256;
  } else if (algorithmName == "SHA-384") {
    *outAlgorithm = ZFH_ALG_SHA_384;
  } else if (algorithmName == "SHA-512") {
    *outAlgorithm = ZFH_ALG_SHA_512;
  } else if (algorithmName == "SHA-512/224") {
    *outAlgorithm = ZFH_ALG_SHA_512_224;
  } else if (algorithmName == "SHA-512/256") {
    *outAlgorithm = ZFH_ALG_SHA_512_256;
  } else if (algorithmName == "MD5") {
    *outAlgorithm = ZFH_ALG_MD5;
  } else if (algorithmName == "SHA-1") {
    *outAlgorithm = ZFH_ALG_SHA_1;
  } else if (algorithmName == "XXH3-64") {
    *outAlgorithm = ZFH_ALG_XXH3_64;
  } else if (algorithmName == "BLAKE3") {
    *outAlgorithm = ZFH_ALG_BLAKE3;
  } else if (algorithmName == "HMAC-SHA-224") {
    *outAlgorithm = ZFH_ALG_HMAC_SHA_224;
  } else if (algorithmName == "HMAC-SHA-256") {
    *outAlgorithm = ZFH_ALG_HMAC_SHA_256;
  } else if (algorithmName == "HMAC-SHA-384") {
    *outAlgorithm = ZFH_ALG_HMAC_SHA_384;
  } else if (algorithmName == "HMAC-SHA-512") {
    *outAlgorithm = ZFH_ALG_HMAC_SHA_512;
  } else if (algorithmName == "HMAC-MD5") {
    *outAlgorithm = ZFH_ALG_HMAC_MD5;
  } else if (algorithmName == "HMAC-SHA-1") {
    *outAlgorithm = ZFH_ALG_HMAC_SHA_1;
  } else {
    return false;
  }

  return true;
}

bool IsHmacAlgorithm(zfh_algorithm algorithm)
{
  switch (algorithm) {
    case ZFH_ALG_HMAC_SHA_224:
    case ZFH_ALG_HMAC_SHA_256:
    case ZFH_ALG_HMAC_SHA_384:
    case ZFH_ALG_HMAC_SHA_512:
    case ZFH_ALG_HMAC_MD5:
    case ZFH_ALG_HMAC_SHA_1:
      return true;
    default:
      return false;
  }
}

std::string ErrorCodeForZfh(zfh_error code)
{
  switch (code) {
    case ZFH_INVALID_ARGUMENT:
      return "E_INVALID_ARGUMENT";
    case ZFH_INVALID_ALGORITHM:
      return "E_UNSUPPORTED_ALGORITHM";
    case ZFH_OUTPUT_BUFFER_TOO_SMALL:
      return "E_BUFFER_TOO_SMALL";
    case ZFH_OPERATION_CANCELED:
      return "E_CANCELLED";
    case ZFH_INVALID_STATE:
      return "E_INVALID_STATE";
    case ZFH_KEY_REQUIRED:
    case ZFH_INVALID_KEY_LENGTH:
      return "E_INVALID_KEY";
    case ZFH_FILE_NOT_FOUND:
      return "E_FILE_NOT_FOUND";
    case ZFH_ACCESS_DENIED:
      return "E_ACCESS_DENIED";
    case ZFH_INVALID_PATH:
      return "E_INVALID_PATH";
    case ZFH_IO_ERROR:
      return "E_IO_ERROR";
    case ZFH_UNKNOWN_ERROR:
    default:
      return "E_HASH_FAILED";
  }
}

template <class T>
void Reject(::React::ReactPromise<T> const &result, std::string code, std::string message) noexcept
{
  result.Reject(::React::ReactError{std::move(code), std::move(message)});
}

template <class T>
void RejectZfhError(::React::ReactPromise<T> const &result, zfh_error code, char const *apiName) noexcept
{
  std::string message = std::string(apiName) + " failed: " + zfh_error_message(code);
  Reject(result, ErrorCodeForZfh(code), std::move(message));
}

bool CheckZigApi(::React::ReactPromise<std::string> const &result) noexcept
{
  const uint32_t runtimeVersion = zfh_api_version();
  if (runtimeVersion == ZFH_API_VERSION) {
    return true;
  }

  std::ostringstream message;
  message << "Incompatible Zig C API version: runtime=" << runtimeVersion
          << " expected=" << ZFH_API_VERSION;
  Reject(result, "E_INCOMPATIBLE_ZIG_API", message.str());
  return false;
}

std::string HexString(uint8_t const *bytes, size_t len)
{
  static constexpr char kHex[] = "0123456789abcdef";
  std::string hex;
  hex.resize(len * 2);
  for (size_t i = 0; i < len; i += 1) {
    hex[i * 2] = kHex[(bytes[i] >> 4) & 0x0f];
    hex[i * 2 + 1] = kHex[bytes[i] & 0x0f];
  }
  return hex;
}

int HexValue(char ch)
{
  if (ch >= '0' && ch <= '9') {
    return ch - '0';
  }
  if (ch >= 'a' && ch <= 'f') {
    return ch - 'a' + 10;
  }
  if (ch >= 'A' && ch <= 'F') {
    return ch - 'A' + 10;
  }
  return -1;
}

bool DecodeHex(std::string const &input, std::vector<uint8_t> *out)
{
  std::string cleaned;
  cleaned.reserve(input.size());
  for (unsigned char ch : input) {
    if (!std::isspace(ch)) {
      cleaned.push_back(static_cast<char>(ch));
    }
  }

  if (cleaned.size() % 2 != 0) {
    return false;
  }

  std::vector<uint8_t> bytes;
  bytes.reserve(cleaned.size() / 2);
  for (size_t i = 0; i < cleaned.size(); i += 2) {
    const int hi = HexValue(cleaned[i]);
    const int lo = HexValue(cleaned[i + 1]);
    if (hi < 0 || lo < 0) {
      return false;
    }
    bytes.push_back(static_cast<uint8_t>((hi << 4) | lo));
  }

  *out = std::move(bytes);
  return true;
}

bool DecodeBase64(std::string const &input, std::vector<uint8_t> *out)
{
  std::array<int8_t, 256> table{};
  table.fill(-1);
  for (int i = 0; i < 26; i += 1) {
    table[static_cast<size_t>('A' + i)] = static_cast<int8_t>(i);
    table[static_cast<size_t>('a' + i)] = static_cast<int8_t>(26 + i);
  }
  for (int i = 0; i < 10; i += 1) {
    table[static_cast<size_t>('0' + i)] = static_cast<int8_t>(52 + i);
  }
  table[static_cast<size_t>('+')] = 62;
  table[static_cast<size_t>('/')] = 63;
  table[static_cast<size_t>('-')] = 62;
  table[static_cast<size_t>('_')] = 63;

  std::vector<uint8_t> bytes;
  bytes.reserve((input.size() * 3) / 4);
  int value = 0;
  int bits = -8;
  bool padded = false;
  size_t nonWhitespace = 0;

  for (unsigned char ch : input) {
    if (std::isspace(ch)) {
      continue;
    }
    nonWhitespace += 1;
    if (ch == '=') {
      padded = true;
      continue;
    }
    if (padded) {
      return false;
    }

    const int decoded = table[ch];
    if (decoded < 0) {
      return false;
    }

    value = (value << 6) | decoded;
    bits += 6;
    if (bits >= 0) {
      bytes.push_back(static_cast<uint8_t>((value >> bits) & 0xff));
      bits -= 8;
    }
  }

  if (nonWhitespace % 4 == 1) {
    return false;
  }

  *out = std::move(bytes);
  return true;
}

bool DecodeKey(std::string const &key, std::string const &encoding, std::vector<uint8_t> *out)
{
  const std::string normalized = ToLower(encoding.empty() ? "utf8" : encoding);
  if (normalized == "utf8") {
    out->assign(key.begin(), key.end());
    return true;
  }
  if (normalized == "hex") {
    return DecodeHex(key, out);
  }
  if (normalized == "base64") {
    return DecodeBase64(key, out);
  }
  return false;
}

bool DecodeInputData(std::string const &text, std::string const &encoding, std::vector<uint8_t> *out, std::string *error)
{
  const std::string normalized = ToLower(encoding.empty() ? "utf8" : encoding);
  if (normalized == "utf8") {
    out->assign(text.begin(), text.end());
    return true;
  }
  if (normalized == "base64") {
    if (DecodeBase64(text, out)) {
      return true;
    }
    *error = "Invalid base64 input for selected encoding";
    return false;
  }

  *error = "Unsupported encoding: " + encoding;
  return false;
}

bool ParseSeed(std::string const &seedString, uint64_t *outSeed)
{
  const auto begin = std::find_if_not(seedString.begin(), seedString.end(), [](unsigned char ch) {
    return std::isspace(ch);
  });
  const auto end = std::find_if_not(seedString.rbegin(), seedString.rend(), [](unsigned char ch) {
    return std::isspace(ch);
  }).base();

  if (begin >= end || *begin == '-' || *begin == '+') {
    return false;
  }

  std::string normalized(begin, end);
  int radix = 10;
  char const *digits = normalized.c_str();
  if (normalized.size() > 2 && normalized[0] == '0' && (normalized[1] == 'x' || normalized[1] == 'X')) {
    radix = 16;
    digits += 2;
    if (*digits == '\0') {
      return false;
    }
  }

  errno = 0;
  char *parseEnd = nullptr;
  const unsigned long long value = std::strtoull(digits, &parseEnd, radix);
  if (errno == ERANGE || parseEnd == digits || *parseEnd != '\0') {
    return false;
  }

  *outSeed = static_cast<uint64_t>(value);
  return true;
}

bool ValidateKeyUsage(zfh_algorithm algorithm, bool hasKey, size_t keyLen, bool hasSeed, std::string *error)
{
  if (hasSeed && algorithm != ZFH_ALG_XXH3_64) {
    *error = "Seed is only used for XXH3-64 on the Zig engine";
    return false;
  }

  if (IsHmacAlgorithm(algorithm) && !hasKey) {
    *error = "Key is required for HMAC algorithms";
    return false;
  }

  if (algorithm == ZFH_ALG_BLAKE3 && hasKey && keyLen != 32) {
    *error = "BLAKE3 keyed mode requires a 32-byte key";
    return false;
  }

  if (!IsHmacAlgorithm(algorithm) && algorithm != ZFH_ALG_BLAKE3 && hasKey) {
    *error = "Key is only used for HMAC algorithms or BLAKE3";
    return false;
  }

  return true;
}

bool PrepareRequest(
    std::string const &algorithmName,
    HashOptions const &options,
    PreparedRequest *outRequest,
    std::string *errorCode,
    std::string *errorMessage)
{
  if (algorithmName == "XXH3-128") {
    *errorCode = "E_UNSUPPORTED_ALGORITHM";
    *errorMessage = "Algorithm 'XXH3-128' is supported only by native engine";
    return false;
  }

  if (!ParseAlgorithm(algorithmName, &outRequest->algorithm)) {
    *errorCode = "E_UNSUPPORTED_ALGORITHM";
    *errorMessage = "Unsupported algorithm: " + algorithmName;
    return false;
  }

  const bool hasKey = options.key.has_value();
  if (hasKey) {
    const std::string keyEncoding = options.keyEncoding.value_or("utf8");
    if (!DecodeKey(options.key.value(), keyEncoding, &outRequest->keyStorage)) {
      *errorCode = "E_INVALID_KEY";
      *errorMessage = "Invalid key for selected keyEncoding";
      return false;
    }
  }

  bool hasSeed = false;
  uint64_t seed = 0;
  if (options.seed.has_value()) {
    hasSeed = true;
    if (!ParseSeed(options.seed.value(), &seed)) {
      *errorCode = "E_INVALID_ARGUMENT";
      *errorMessage = "Seed must fit into an unsigned 64-bit integer";
      return false;
    }
  }

  std::string validationError;
  if (!ValidateKeyUsage(outRequest->algorithm, hasKey, outRequest->keyStorage.size(), hasSeed, &validationError)) {
    *errorCode = "E_INVALID_ARGUMENT";
    *errorMessage = std::move(validationError);
    return false;
  }

  outRequest->options = {};
  outRequest->options.struct_size = ZFH_OPTIONS_STRUCT_SIZE;
  if (hasKey) {
    outRequest->options.flags |= ZFH_OPTION_HAS_KEY;
    outRequest->options.key_ptr = outRequest->keyStorage.empty() ? &kEmptyByte : outRequest->keyStorage.data();
    outRequest->options.key_len = outRequest->keyStorage.size();
  }
  if (hasSeed) {
    outRequest->options.flags |= ZFH_OPTION_HAS_SEED;
    outRequest->options.seed = seed;
  }

  outRequest->hasOptions = hasKey || hasSeed;
  return true;
}

zfh_request BuildZfhRequest(PreparedRequest const &prepared, OperationState *operation)
{
  zfh_request request{};
  request.struct_size = ZFH_REQUEST_STRUCT_SIZE;
  request.options_ptr = prepared.hasOptions ? &prepared.options : nullptr;
  if (operation != nullptr) {
    request.operation_ptr = operation->statePtr;
    request.operation_len = operation->stateLen;
  }
  return request;
}

bool PercentDecode(std::string const &input, std::string *out)
{
  std::string decoded;
  decoded.reserve(input.size());
  for (size_t i = 0; i < input.size(); i += 1) {
    if (input[i] != '%') {
      decoded.push_back(input[i]);
      continue;
    }
    if (i + 2 >= input.size()) {
      return false;
    }
    const int hi = HexValue(input[i + 1]);
    const int lo = HexValue(input[i + 2]);
    if (hi < 0 || lo < 0) {
      return false;
    }
    decoded.push_back(static_cast<char>((hi << 4) | lo));
    i += 2;
  }
  *out = std::move(decoded);
  return true;
}

bool LooksLikeUrlScheme(std::string const &value)
{
  const size_t pos = value.find("://");
  if (pos == std::string::npos || pos == 0) {
    return false;
  }
  if (!std::isalpha(static_cast<unsigned char>(value[0]))) {
    return false;
  }
  for (size_t i = 1; i < pos; i += 1) {
    const unsigned char ch = static_cast<unsigned char>(value[i]);
    if (!std::isalnum(ch) && ch != '+' && ch != '-' && ch != '.') {
      return false;
    }
  }
  return true;
}

bool NormalizeFilePath(std::string const &filePath, std::string *outPath, std::string *errorCode, std::string *errorMessage)
{
  constexpr char kFileScheme[] = "file://";
  if (filePath.rfind(kFileScheme, 0) == 0) {
    std::string raw = filePath.substr(sizeof(kFileScheme) - 1);
    if (raw.rfind("localhost/", 0) == 0) {
      raw = raw.substr(9);
    }
    const bool isUncUri =
        !raw.empty() &&
        raw[0] != '/' &&
        !(raw.size() >= 2 && std::isalpha(static_cast<unsigned char>(raw[0])) && raw[1] == ':');
    if (raw.size() >= 3 && raw[0] == '/' && std::isalpha(static_cast<unsigned char>(raw[1])) && raw[2] == ':') {
      raw.erase(raw.begin());
    }
    if (isUncUri) {
      raw.insert(0, "//");
    }

    std::string decoded;
    if (!PercentDecode(raw, &decoded)) {
      *errorCode = "E_INVALID_PATH";
      *errorMessage = "Invalid percent-encoded file URL";
      return false;
    }
    std::replace(decoded.begin(), decoded.end(), '/', '\\');
    *outPath = std::move(decoded);
    return true;
  }

  if (LooksLikeUrlScheme(filePath)) {
    *errorCode = "E_INVALID_PATH";
    *errorMessage = "Unsupported URL scheme. fileHash on Windows expects a local file path or file:// URL";
    return false;
  }

  *outPath = filePath;
  return true;
}

void ComputeFileHash(
    std::string filePath,
    std::string algorithm,
    HashOptions options,
    std::string operationId,
    ::React::ReactPromise<std::string> result) noexcept
{
  try {
    if (!CheckZigApi(result)) {
      return;
    }

    std::string normalizedPath;
    std::string errorCode;
    std::string errorMessage;
    if (!NormalizeFilePath(filePath, &normalizedPath, &errorCode, &errorMessage)) {
      Reject(result, std::move(errorCode), std::move(errorMessage));
      return;
    }

    PreparedRequest prepared{};
    if (!PrepareRequest(algorithm, options, &prepared, &errorCode, &errorMessage)) {
      Reject(result, std::move(errorCode), std::move(errorMessage));
      return;
    }

    OperationState operation;
    OperationState *operationPtr = nullptr;
    OperationGuard operationGuard;
    if (!operationId.empty()) {
      const zfh_error operationError = InitOperationState(operation);
      if (operationError != ZFH_OK) {
        RejectZfhError(result, operationError, "zfh_operation_init_inplace");
        return;
      }
      operationPtr = &operation;
      RegisterOperation(operationId, operationPtr);
      operationGuard.operationId = operationId;
      operationGuard.operation = operationPtr;
      operationGuard.registered = true;
    }

    zfh_context *context = nullptr;
    zfh_error code = zfh_context_create(&context);
    if (code != ZFH_OK) {
      RejectZfhError(result, code, "zfh_context_create");
      return;
    }

    std::vector<uint8_t> digest(zfh_max_digest_length());
    size_t written = 0;
    zfh_request request = BuildZfhRequest(prepared, operationPtr);
    zfh_request const *requestPtr = (prepared.hasOptions || operationPtr != nullptr) ? &request : nullptr;

    code = zfh_context_file_hash(
        context,
        prepared.algorithm,
        reinterpret_cast<uint8_t const *>(normalizedPath.data()),
        normalizedPath.size(),
        requestPtr,
        digest.data(),
        digest.size(),
        &written);

    const zfh_error destroyCode = zfh_context_destroy(context);
    if (code == ZFH_OK && destroyCode != ZFH_OK) {
      code = destroyCode;
    }

    if (code != ZFH_OK) {
      RejectZfhError(result, code, "zfh_context_file_hash");
      return;
    }

    result.Resolve(HexString(digest.data(), written));
  } catch (std::exception const &ex) {
    Reject(result, "E_HASH_FAILED", ex.what());
  } catch (...) {
    Reject(result, "E_HASH_FAILED", "Unknown hash error");
  }
}

void ComputeStringHash(
    std::string text,
    std::string algorithm,
    std::string encoding,
    HashOptions options,
    std::string operationId,
    ::React::ReactPromise<std::string> result) noexcept
{
  try {
    if (!CheckZigApi(result)) {
      return;
    }

    std::string errorCode;
    std::string errorMessage;
    PreparedRequest prepared{};
    if (!PrepareRequest(algorithm, options, &prepared, &errorCode, &errorMessage)) {
      Reject(result, std::move(errorCode), std::move(errorMessage));
      return;
    }

    std::vector<uint8_t> data;
    if (!DecodeInputData(text, encoding, &data, &errorMessage)) {
      Reject(result, "E_INVALID_ARGUMENT", std::move(errorMessage));
      return;
    }

    OperationState operation;
    OperationState *operationPtr = nullptr;
    OperationGuard operationGuard;
    if (!operationId.empty()) {
      const zfh_error operationError = InitOperationState(operation);
      if (operationError != ZFH_OK) {
        RejectZfhError(result, operationError, "zfh_operation_init_inplace");
        return;
      }
      operationPtr = &operation;
      RegisterOperation(operationId, operationPtr);
      operationGuard.operationId = operationId;
      operationGuard.operation = operationPtr;
      operationGuard.registered = true;
    }

    std::vector<uint8_t> digest(zfh_max_digest_length());
    size_t written = 0;
    zfh_request request = BuildZfhRequest(prepared, operationPtr);
    zfh_request const *requestPtr = (prepared.hasOptions || operationPtr != nullptr) ? &request : nullptr;
    uint8_t const *dataPtr = data.empty() ? &kEmptyByte : data.data();

    const zfh_error code = zfh_string_hash(
        prepared.algorithm,
        dataPtr,
        data.size(),
        requestPtr,
        digest.data(),
        digest.size(),
        &written);

    if (code != ZFH_OK) {
      RejectZfhError(result, code, "zfh_string_hash");
      return;
    }

    result.Resolve(HexString(digest.data(), written));
  } catch (std::exception const &ex) {
    Reject(result, "E_HASH_FAILED", ex.what());
  } catch (...) {
    Reject(result, "E_HASH_FAILED", "Unknown hash error");
  }
}

template <class TCallable>
void RunAsync(TCallable &&callable, ::React::ReactPromise<std::string> &&result) noexcept
{
  auto rejectPromise = result;
  try {
    std::thread(std::forward<TCallable>(callable), std::move(result)).detach();
  } catch (std::exception const &ex) {
    Reject(rejectPromise, "E_HASH_FAILED", ex.what());
  } catch (...) {
    Reject(rejectPromise, "E_HASH_FAILED", "Failed to start hash operation");
  }
}

} // namespace

namespace winrt::Preeternal::FileHash
{

void FileHash::Initialize(::React::ReactContext const &reactContext) noexcept
{
  m_reactContext = reactContext;
}

void FileHash::fileHash(
    std::string filePath,
    std::string algorithm,
    HashOptions &&options,
    std::string operationId,
    ::React::ReactPromise<std::string> &&result) noexcept
{
  RunAsync(
      [filePath = std::move(filePath),
       algorithm = std::move(algorithm),
       options = std::move(options),
       operationId = std::move(operationId)](::React::ReactPromise<std::string> result) mutable noexcept {
        ComputeFileHash(std::move(filePath), std::move(algorithm), std::move(options), std::move(operationId), std::move(result));
      },
      std::move(result));
}

void FileHash::stringHash(
    std::string text,
    std::string algorithm,
    std::string encoding,
    HashOptions &&options,
    std::string operationId,
    ::React::ReactPromise<std::string> &&result) noexcept
{
  RunAsync(
      [text = std::move(text),
       algorithm = std::move(algorithm),
       encoding = std::move(encoding),
       options = std::move(options),
       operationId = std::move(operationId)](::React::ReactPromise<std::string> result) mutable noexcept {
        ComputeStringHash(
            std::move(text),
            std::move(algorithm),
            std::move(encoding),
            std::move(options),
            std::move(operationId),
            std::move(result));
      },
      std::move(result));
}

void FileHash::cancelOperation(std::string operationId) noexcept
{
  CancelOperationById(operationId);
}

void FileHash::getRuntimeInfo(::React::ReactPromise<RuntimeInfo> &&result) noexcept
{
  RuntimeInfo info{};
  info.engine = "zig";
  result.Resolve(info);
}

void FileHash::getRuntimeDiagnostics(::React::ReactPromise<RuntimeDiagnostics> &&result) noexcept
{
  RuntimeDiagnostics diagnostics{};
  diagnostics.engine = "zig";
  diagnostics.zigApiVersion = static_cast<double>(zfh_api_version());
  diagnostics.zigExpectedApiVersion = static_cast<double>(ZFH_API_VERSION);
  diagnostics.zigApiCompatible = zfh_api_version() == ZFH_API_VERSION;
  diagnostics.zigVersion = ZFH_ZIG_CORE_VERSION;
  result.Resolve(diagnostics);
}

} // namespace winrt::Preeternal::FileHash
