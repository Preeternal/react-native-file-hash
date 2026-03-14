# Архитектура переключаемого движка (Zig / Native)

> Статус: внутренний архитектурный документ.
> Аудитория: maintainers/contributors.

## 1. Цель

Обеспечить возможность выбора реализации движка хэширования (Zig через C ABI или нативная Swift/Kotlin реализация) на этапе сборки, так чтобы:

- В финальный бинарь попадал один активный native backend
- Лишний native-код не линковался
- TurboModule интерфейс остаётся единым между движками
- Решение совместимо с RN CLI и Expo (prebuild)

---

## 2. Общая схема слоёв

JS (TurboModule)
↓
Codegen (Spec → ObjC++ / Kotlin glue)
↓
FileHashModule (единая точка входа)
↓
Engine implementation (Zig C ABI или Native)
↓
Хэш-ядро

Codegen не зависит от выбранного движка.
На Android используется единый bridge-слой, а выбор executor происходит в рантайме по
`BuildConfig.FILE_HASH_ENGINE`, который заполняется на этапе сборки.

---

## 3. Android

### 3.1 Переключение через gradle.properties

В клиентском приложении:

android/gradle.properties

react_native_file_hash_engine=zig
или
react_native_file_hash_engine=native

В build.gradle библиотеки:

- Читаем свойство
- Пробрасываем его в `BuildConfig.FILE_HASH_ENGINE`
- Управляем `externalNativeBuild (CMake)`
- Добавляем сгенерированные codegen-папки в `sourceSets.main`

### 3.2 Изоляция реализаций

Текущая реализация не использует раздельные `src/zig/java` / `src/native/java`.

Вместо этого:

- bridge-класс `FileHashModule.kt` всегда лежит в `android/src/main/java`
- engine-specific код вынесен во внутренние executors:
  - `NativeHashEngine.kt`
  - `ZigHashEngine.kt`
- `FileHashModule.kt` в рантайме выбирает executor по `BuildConfig.FILE_HASH_ENGINE`
- Zig C++ слой разнесён по ответственностям:
  - `zig_jni.cpp` — только JNI entrypoints для `ZigHasher`
  - `zig_bridge.{h,cpp}` — вызовы `zfh_*`, подготовка `zfh_options`, streaming state
  - `error_mapping.{h,cpp}` — маппинг `zfh_error` в Java exceptions
  - `jni_utils.{h,cpp}` — преобразование JNI типов и общие утилиты
- тяжёлое разделение происходит на native-слое:
  - при `engine=zig` CMake собирает только Zig JNI bridge + Zig prebuilt
  - при `engine=native` собирается текущий native C/JNI pipeline

Таким образом RN bridge не дублируется, а лишний native backend не попадает в итоговую
сборку.

---

## 4. iOS

### 4.1 Переключение через Podfile

В клиентском ios/Podfile:

```ruby
ENV['ZFH_ENGINE'] ||= 'native'
# или
ENV['ZFH_ENGINE'] ||= 'zig'
```

После этого выполняется:

cd ios && pod install

### 4.2 Podspec

В FileHash.podspec:

```ruby
engine = (ENV['ZFH_ENGINE'] || 'native').downcase

if engine == 'zig'
  s.source_files = [
    'ios/FileHash.h',
    'ios/FileHash.mm',
    'ios/FileHashBridgeHelpers.{h,mm}',
    'ios/FileHashBridgeZig.{h,mm}',
    'ios/FileHashZigHelpers.{h,mm}'
  ]
  s.vendored_frameworks = 'third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework'
else
  s.source_files = ['ios/**/*.{h,m,mm,swift}', ...]
end
```

Переключение происходит на этапе pod install.
Xcode не участвует в выборе движка.

---

## 5. TurboModule и Codegen

- NativeFileHashSpec остаётся единым для обоих движков
- FileHashModule всегда существует
- Меняется только внутренняя реализация
- Engine по умолчанию: `native`

На iOS:

`FileHash.mm` всегда присутствует.  
Внутри либо вызывается Zig C API, либо подключается текущая Swift/native реализация
(в зависимости от `ZFH_ENGINE`).

На Android:

TurboModule → Kotlin  
Kotlin вызывает либо JNI (Zig .so), либо native реализацию.

Codegen не зависит от выбора движка.

---

## 5.1 Текущая форма JS API после breaking changes

Актуальное состояние публичного JS API:

- основной метод: `stringHash`; `hashString` оставлен как deprecated alias для миграции
- `THashMode` удалён из публичного API
- HMAC вынесен в отдельные алгоритмы (`HMAC-SHA-*`, `HMAC-MD5`, `HMAC-SHA-1`)
- keyed/plain режим для `BLAKE3` определяется автоматически по наличию `key`
- формат результата фиксирован: lowercase hex
- `XXH3-128` поддерживается только в `native` engine
- при `engine=zig` запрос `XXH3-128` возвращает явную ошибку `E_UNSUPPORTED_ALGORITHM`

README должен оставаться синхронным с этими решениями и явно описывать миграцию со старого
API.

---

## 6. Expo

### 6.1 Expo Go

- Библиотека не поддерживается в Expo Go (есть нативный код, требуется prebuild/dev build).
- Ограничение одинаково для `native` и `zig` engine.

### 6.2 Expo prebuild / EAS build

Переключение через config plugin.

Реализация: `app.plugin.js` в корне пакета.

В app.json:

```json
{
  "expo": {
    "plugins": [["@preeternal/react-native-file-hash", { "engine": "zig" }]]
  }
}
```

Plugin:

- Модифицирует gradle.properties
- Модифицирует Podfile
- Запускается на этапе prebuild

---

## 7. Принципы архитектуры

1. Выбор engine задаётся на этапе сборки, а в общем bridge-коде применяется через рантайм-dispatch
2. В бинарь попадает один active native backend; общий RN bridge остаётся единым
3. TurboModule контракт стабилен
4. Zig C ABI — интеграционная граница
5. Android не дублирует bridge по `sourceSets`; изоляция достигается executor-слоем + CMake/podspec

---

## 8. Стратегия по умолчанию

- Default: native engine
- Zig включается явно
- Отсутствие переменной не ломает сборку

---

Эта архитектура обеспечивает:

- Контроль размера приложения
- Чистую границу ответственности
- Поддержку RN CLI и Expo
- Отсутствие дублирования bridge-кода на Android

### Потоки

JSI вызывается с JS потока, и если там пойдёт чтение/хеширование файла — UI может страдать.
Лучше: JSI метод запускает работу в нативном worker’е/диспетчере и возвращает Promise.
Согласовано с текущей многопоточностью:

- iOS: и `native`, и `zig` путь исполняются в выделенных `OperationQueue` (до 2 параллельных задач).
- Android: `Dispatchers.IO` + корутины, JNI состояния независимы между вызовами.

### Формат результата в JS

- Публичный API всегда возвращает lowercase hex string.
- Формат результата не настраивается: всегда lowercase hex.

### Где хранится native C и куда класть Zig bridge

Текущее расположение native C-кода:

- iOS: публичный фасад `ios/FileHash.mm` + native boundary `ios/FileHashBridgeNative.{h,m}`
- Android: `android/src/main/cpp/hash_jni.cpp`
- Third-party исходники: `third_party/blake3`, `third_party/xxhash`

Текущее расположение Zig bridge:

- iOS: `ios/FileHash.mm` остаётся фасадом, а Zig путь вынесен в
  `ios/FileHashBridgeZig.{h,mm}` + `ios/FileHashZigHelpers.{h,mm}`
- Android: JNI вход лежит в `android/src/main/cpp/zig_jni.cpp`, а Zig runtime logic вынесена в
  `android/src/main/cpp/zig_bridge.{h,cpp}`
- В обоих случаях верхний Kotlin/ObjC++ bridge остаётся единым

Текущее состояние:

- Android: Zig C++ слой разнесён:
  - `zig_jni.cpp` — JNI entrypoints
  - `zig_bridge.{h,cpp}` — вызовы `zfh_*`, подготовка запросов, streaming state
  - `error_mapping.{h,cpp}` — маппинг ошибок
  - `jni_utils.{h,cpp}` — JNI helper-утилиты
- Android: общий `FileHashModule.kt` выбирает между `NativeHashEngine.kt` и
  `ZigHashEngine.kt` в рантайме по `BuildConfig.FILE_HASH_ENGINE`.
- Android: для `content://` в `engine=zig` используется streaming C ABI v2
  (`zfh_hasher_state_size/align`, `zfh_hasher_init_inplace`, `zfh_hasher_update`, `zfh_hasher_final`).
- Android: в текущем shipped Zig setup (`generic` prebuilt без `+sha2`) для
  `SHA-224`/`SHA-256` и `HMAC-SHA-224`/`HMAC-SHA-256` используется route в native executor.
- Android: при `engine=zig` CMake собирает только
  `jni_utils.cpp` + `error_mapping.cpp` + `zig_bridge.cpp` + `zig_jni.cpp`
  и Zig prebuilt; native C-пайплайн (`hash_jni.cpp`/`xxhash`/`blake3`) не линкуется.
- Android: prebuilt Zig static libs собираются в `third_party/zig-files-hash-prebuilt/android/<ABI>/libzig_files_hash.a`.
- Android: сборка prebuilt вынесена в `scripts/build-zig-android.sh`.
- iOS: `FileHash.mm` остаётся фасадом и роутером; Zig путь вынесен в
  `FileHashBridgeZig` / `FileHashZigHelpers`, native Swift boundary — в `FileHashBridgeNative`.
- iOS: в `engine=zig` `fileHash` использует `zfh_file_hash` (one-shot API);
  чтение файла внутри Zig ядра остаётся chunked.
- iOS: при `engine=zig` podspec подключает только ObjC++ фасад и Zig-specific helper-файлы
  (`FileHash.h`, `FileHash.mm`, `FileHashBridgeHelpers.*`, `FileHashBridgeZig.*`,
  `FileHashZigHelpers.*`) и `ZigFilesHash.xcframework`; native Swift/C реализация в этот
  режим не входит.
- iOS: prebuilt Zig xcframework собирается скриптом `scripts/build-zig-ios.sh` в `third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework`.

URL/security-scoped fallback на iOS (реализовано):

- Признак 1: входная строка парсится как `NSURL`, и `scheme != file`.
- Признак 2: `scheme == file`, но прямой путь недоступен для чтения при наличии URL-контекста
  (типичный случай security-scoped/Files provider).
- Признак 3: источник из document picker требует `startAccessingSecurityScopedResource`.
- Для этих случаев делать отдельную ветку чтения URL/stream + `zfh_hasher_*`;
  для обычного локального path оставлять быстрый `zfh_file_hash`.
- Текущая реализация:
  - сначала пробует быстрый `zfh_file_hash` для локального path;
  - `scheme != file` сразу отклоняется как `E_INVALID_PATH` (функция ожидает локальный файл);
  - при `file://` + ошибках доступа/пути (`AccessDenied`/`FileNotFound`/`InvalidPath`/`IoError`)
    переключается на `NSInputStream` + `zfh_hasher_*` и
    `startAccessingSecurityScopedResource`.
  - fallback-чтение выполняется через `NSFileCoordinator` (`coordinateReadingItemAtURL`) для
    более надёжной работы с Files/iCloud providers.
  - для iCloud ubiquitous items добавлена проверка `isDownloaded`; если файл ещё не скачан,
    вызывается `startDownloadingUbiquitousItemAtURL`, возвращается ошибка с рекомендацией повторить позже.
  - ошибки `NSError` (POSIX/Cocoa) маппятся в более точные RN-коды:
    `E_FILE_NOT_FOUND` / `E_ACCESS_DENIED` / `E_INVALID_PATH` / `E_IO_ERROR`.

## 9. Бенчмарки и методология производительности

Цель: получить честные и воспроизводимые цифры для README/релизных заметок, не смешивая
между собой «скорость ядра», «стоимость обвязки» и «реальную скорость из JS».

### 9.1 Что измеряем (3 слоя)

1. **Core hashing (in-memory)** — чистая скорость алгоритма без файловой системы и без
   мостов.
2. **Overhead обвязки (FFI / JNI / ObjC++)** — стоимость границы вызовов и streaming API
   (`init/update/final`).
3. **End-to-end из JS (TurboModule)** — реальная скорость `stringHash`/`fileHash` в
   приложении, включая мост и часть платформенного IO.

Рекомендация для публикации:

- В README и релизных заметках показывать в первую очередь **(3)**.
- (1) использовать как supporting data, если нужно объяснить разницу между движками.
- (2) держать как внутренний диагностический бенч; в публичные материалы его обычно не
  выносить.

### 9.2 Общие правила методологии

- Сборка: только **Release** / **ReleaseFast**. Debug-цифры не публиковать.
- Прогрев: первые **1–2** прогона не учитывать.
- Повторы: минимум **10** итераций; базовый отчёт: **median**. Если разброс заметен,
  добавить **p95**.
- Один и тот же набор данных, chunk size и параметры для сравниваемых движков.
- Замеры делать на одном и том же девайсе, в близких условиях: без фоновой нагрузки,
  без термального троттлинга, желательно на зарядке.
- Для больших входов считать **MB/s**.
- Для маленьких входов публиковать в первую очередь **median ms**, а не только MB/s.

Данные:

- `zeros` (all-zero)
- `random` (псевдослучайные; фиксированный seed)

Важно: IO и hashing — разные вещи. Для `fileHash` локальный путь и provider-backed путь
не смешивать в одну «скоростную» цифру.

Для файлов полезно публиковать отдельно:

- **warm cache** (повторный прогон того же файла)
- **cold-ish** (после перезапуска приложения/девайса или иного сброса кэша, если практично)

### 9.3 Минимальный набор бенчмарков

#### A) Реальный headline benchmark для README (RN end-to-end)

Это главный набор, который отвечает на вопрос: «зачем существует zig-ветка и как она
ведёт себя в приложении».

Android (release, один и тот же девайс):

1. `fileHash` на локальном `file://`:
   - один средний файл (например **16 MiB**)
   - один большой файл (например **200 MiB**)
   - сравнение `native` vs `zig`
2. `fileHash` через `content://`:
   - публиковать отдельно от `file://`, т.к. это другой IO-путь
3. `stringHash`:
   - `utf8` строка (**64 KiB**)
   - `base64` payload (**1 MiB**)

iOS (release, один и тот же девайс):

1. `fileHash` по обычному локальному path:
   - **16 MiB** и **200 MiB**
   - сравнение `native` vs `zig`
2. Files provider / iCloud / security-scoped fallback:
   - это отдельный сценарий, публиковать отдельно от «быстрого локального path»
3. `stringHash`:
   - `utf8` строка (**64 KiB**)

Публикация:

- Для больших файлов: **seconds + MB/s**
- Для строк и маленьких payload: **median ms**

#### B) Core benchmark как supporting data

Этот слой нужен, если надо показать разницу именно между ядрами, а не между полными RN
пайплайнами.

Минимальный набор алгоритмов:

- `BLAKE3`
- `SHA-256`
- `XXH3-64`

Наборы данных:

- `1 MiB`
- `16 MiB`
- `256 MiB`
- `zeros`
- `random` (фиксированный seed)

Прогоны:

- one-shot, если для конкретного слоя он существует
- streaming с фиксированным chunk size (например **256 KiB**) для честного сравнения

Результат:

- таблица MB/s по каждому алгоритму (`median`)

#### C) Overhead streaming-обвязки (внутренний диагностический бенч)

Этот слой не обязателен для README. Он нужен, если надо понять, где именно теряется
производительность: в самом хэшировании или на границе вызовов.

Для Zig C ABI v2:

- `zfh_hasher_state_size/align`
- `zfh_hasher_init_inplace`
- `zfh_hasher_update` (N раз)
- `zfh_hasher_final`

Сценарии:

- `chunk=4 KiB` (много `update`)
- `chunk=256 KiB` (реалистичный компромисс)
- `chunk=1 MiB` (мало `update`)

Цель:

- понять чувствительность к размеру чанка
- отделить «ядро медленное» от «граница вызовов дорогая»

### 9.4 Инструменты и формат вывода

- Core benchmark (для `zig-files-hash` или внутреннего native/core слоя):
  - отдельный bench target / bench command
- Android:
  - release build
  - instrumentation test или Macrobenchmark
  - таймер: `elapsedRealtimeNanos()`
- iOS:
  - release build
  - XCTest `measure {}` или таймер на `mach_continuous_time()`

Формат вывода:

- machine-readable JSON или CSV для сырых результатов
- короткие агрегированные таблицы для README/постов
- всегда указывать: device model, OS version, build type, file size / payload size,
  chunk size, iterations, warm/cold

### 9.5 Как публиковать результаты

README:

- Основная таблица: **RN end-to-end (`native` vs `zig`)**
- Один локальный file benchmark и один string benchmark как headline-цифры
- Если разница между движками существенная: добавить компактную supporting-таблицу по
  core benchmark
- Короткий блок _Methodology_: device model, OS, build type, payload/file size, chunk size,
  iterations, warm/cold

Twitter/LinkedIn:

- 1–2 самые понятные цифры:
  - например `fileHash 200 MiB: native vs zig`
  - и, если уместно, один core-результат вроде `BLAKE3 MB/s`
- Всегда указывать девайс, build type и размер входа.

### 9.6 Конкретный план замеров (1 Android + 1 iPhone)

Ниже — минимальный шаблон, который можно реально прогнать перед релизом и потом просто
заполнить цифрами.

#### A) Карточка окружения

| Platform | Device | OS  | Build   | App flavor  | Notes |
| -------- | ------ | --- | ------- | ----------- | ----- |
| Android  |        |     | Release | example app |       |
| iOS      |        |     | Release | example app |       |

#### B) Android: headline fileHash

| Engine | Path type | Algorithm | File                    | Size    | Iterations | Warm/Cold | Median sec | p95 sec | MB/s | Notes |
| ------ | --------- | --------- | ----------------------- | ------- | ---------- | --------- | ---------- | ------- | ---- | ----- |
| native | `file://` | `SHA-256` | `bench-16m-random.bin`  | 16 MiB  | 10         | warm      |            |         |      |       |
| zig    | `file://` | `SHA-256` | `bench-16m-random.bin`  | 16 MiB  | 10         | warm      |            |         |      |       |
| native | `file://` | `SHA-256` | `bench-200m-random.bin` | 200 MiB | 10         | warm      |            |         |      |       |
| zig    | `file://` | `SHA-256` | `bench-200m-random.bin` | 200 MiB | 10         | warm      |            |         |      |       |
| native | `file://` | `BLAKE3`  | `bench-200m-random.bin` | 200 MiB | 10         | warm      |            |         |      |       |
| zig    | `file://` | `BLAKE3`  | `bench-200m-random.bin` | 200 MiB | 10         | warm      |            |         |      |       |

#### C) Android: provider-backed path

`content://` публиковать отдельно. Эти цифры не сравнивать в одной строке с обычным
локальным `file://`.

| Engine | Path type    | Algorithm | Source               | Size    | Iterations | Median sec | MB/s | Notes |
| ------ | ------------ | --------- | -------------------- | ------- | ---------- | ---------- | ---- | ----- |
| native | `content://` | `SHA-256` | SAF / DocumentPicker | 16 MiB  | 10         |            |      |       |
| zig    | `content://` | `SHA-256` | SAF / DocumentPicker | 16 MiB  | 10         |            |      |       |
| native | `content://` | `BLAKE3`  | SAF / DocumentPicker | 200 MiB | 10         |            |      |       |
| zig    | `content://` | `BLAKE3`  | SAF / DocumentPicker | 200 MiB | 10         |            |      |       |

#### D) Android: stringHash

| Engine | Encoding | Algorithm | Payload                  | Size          | Iterations | Median ms | p95 ms | Notes |
| ------ | -------- | --------- | ------------------------ | ------------- | ---------- | --------- | ------ | ----- |
| native | `utf8`   | `SHA-256` | repeated text            | 64 KiB        | 20         |           |        |       |
| zig    | `utf8`   | `SHA-256` | repeated text            | 64 KiB        | 20         |           |        |       |
| native | `base64` | `SHA-256` | binary payload as base64 | 1 MiB decoded | 20         |           |        |       |
| zig    | `base64` | `SHA-256` | binary payload as base64 | 1 MiB decoded | 20         |           |        |       |

#### E) iOS: headline fileHash

| Engine | Path type  | Algorithm | File                    | Size    | Iterations | Warm/Cold | Median sec | p95 sec | MB/s | Notes |
| ------ | ---------- | --------- | ----------------------- | ------- | ---------- | --------- | ---------- | ------- | ---- | ----- |
| native | local path | `SHA-256` | `bench-16m-random.bin`  | 16 MiB  | 10         | warm      |            |         |      |       |
| zig    | local path | `SHA-256` | `bench-16m-random.bin`  | 16 MiB  | 10         | warm      |            |         |      |       |
| native | local path | `SHA-256` | `bench-200m-random.bin` | 200 MiB | 10         | warm      |            |         |      |       |
| zig    | local path | `SHA-256` | `bench-200m-random.bin` | 200 MiB | 10         | warm      |            |         |      |       |
| native | local path | `BLAKE3`  | `bench-200m-random.bin` | 200 MiB | 10         | warm      |            |         |      |       |
| zig    | local path | `BLAKE3`  | `bench-200m-random.bin` | 200 MiB | 10         | warm      |            |         |      |       |

#### F) iOS: provider-backed / security-scoped fallback

Эти замеры нужны для понимания реального поведения, но не как «headline speed».

| Engine | Path type         | Algorithm | Source           | Size    | Iterations | Median sec | MB/s | Notes |
| ------ | ----------------- | --------- | ---------------- | ------- | ---------- | ---------- | ---- | ----- |
| native | Files provider    | `SHA-256` | UIDocumentPicker | 16 MiB  | 10         |            |      |       |
| zig    | Files provider    | `SHA-256` | UIDocumentPicker | 16 MiB  | 10         |            |      |       |
| native | iCloud downloaded | `BLAKE3`  | Files / iCloud   | 200 MiB | 10         |            |      |       |
| zig    | iCloud downloaded | `BLAKE3`  | Files / iCloud   | 200 MiB | 10         |            |      |       |

#### G) iOS: stringHash

| Engine | Encoding | Algorithm | Payload       | Size   | Iterations | Median ms | p95 ms | Notes |
| ------ | -------- | --------- | ------------- | ------ | ---------- | --------- | ------ | ----- |
| native | `utf8`   | `SHA-256` | repeated text | 64 KiB | 20         |           |        |       |
| zig    | `utf8`   | `SHA-256` | repeated text | 64 KiB | 20         |           |        |       |

#### H) Откуда брать тестовые файлы

Лучше не скачивать случайные файлы из интернета. Для воспроизводимости проще
генерировать их самостоятельно и использовать одни и те же фикстуры на обеих платформах.

Рекомендуемый набор:

- `bench-16m-zero.bin`
- `bench-16m-random.bin`
- `bench-200m-random.bin`

Как получить:

1. **Локально сгенерировать на Mac/PC**, затем скопировать в приложение / Files / SAF:
   - zero file:
     - `mkfile 16m bench-16m-zero.bin` (macOS)
     - или `dd if=/dev/zero of=bench-16m-zero.bin bs=1m count=16`
   - random file:
     - `openssl rand -out bench-16m-random.bin $((16 * 1024 * 1024))`
     - `openssl rand -out bench-200m-random.bin $((200 * 1024 * 1024))`
2. **Для `content://` и iOS Files provider**:
   - взять те же уже сгенерированные файлы
   - импортировать их через системный picker, чтобы сравнивать один и тот же контент
3. **Для `stringHash`**:
   - `utf8`: один заранее подготовленный текстовый блок фиксированного размера
   - `base64`: base64-строка, полученная из заранее сгенерированного бинарного файла

Практический совет:

- Для первого прохода достаточно одного «быстрого» алгоритма (`BLAKE3`) и одного
  «стандартного» (`SHA-256`).
- Если потом захочется добавить ещё одну сравнительную строку, логичнее брать
  `XXH3-64`, а не раздувать таблицу всеми алгоритмами.

## 10. Мануальные тест-кейсы (iOS + Android)

Обозначения окружения:

- `SIM/EMU` — достаточно iOS Simulator / Android Emulator.
- `DEVICE` — обязательно проверить на реальном устройстве.
- `BOTH` — желательно проверить и там, и там.

### 10.1 Кросс-платформенные кейсы (оба движка)

1. `stringHash` с `encoding=utf8` и `encoding=base64`.
   Ожидание: детерминированный результат, возвращается lowercase hex digest.
   Окружение: `SIM/EMU`.

2. `fileHash` по локальному файлу (`file://` / app-accessible local path, где применимо).
   Ожидание: хэш успешен в `native` и `zig`; значения совпадают между движками для
   поддерживаемых алгоритмов.
   Окружение: `SIM/EMU`.

3. HMAC-алгоритмы без ключа.
   Ожидание: понятная ошибка про обязательный ключ.
   Окружение: `SIM/EMU`.

4. HMAC-алгоритмы с ключом (включая пустой ключ).
   Ожидание: вызов успешен, результат стабилен.
   Окружение: `SIM/EMU`.

5. `BLAKE3` без ключа и с ключом 32 байта.
   Ожидание: оба режима работают, keyed-режим активируется автоматически при наличии ключа.
   Окружение: `SIM/EMU`.

6. `BLAKE3` с некорректной длиной ключа.
   Ожидание: ошибка валидации ключа.
   Окружение: `SIM/EMU`.

7. Ключ передан для алгоритма, который не поддерживает ключ.
   Ожидание: ошибка валидации аргументов.
   Окружение: `SIM/EMU`.

8. `algorithm=XXH3-128` при `engine=zig`.
   Ожидание: явная ошибка `unsupported algorithm` (предсказуемый код/текст).
   Окружение: `SIM/EMU`.

9. Несуществующий локальный путь / URI к файлу.
   Ожидание: `E_FILE_NOT_FOUND`.
   Окружение: `SIM/EMU`.

10. Конкурентные вызовы (`fileHash`/`stringHash`) 5-10 задач параллельно.
    Ожидание: нет падений/гонок, UI не блокируется, все Promise завершаются корректно.
    Окружение: `SIM/EMU` + smoke на `DEVICE`.

### 10.2 iOS-специфичные кейсы

1. `file://` URL на локальный файл (без security scope).
   Ожидание: быстрый путь `zfh_file_hash` в zig-движке / штатный native путь в native-движке.
   Окружение: `SIM`.

2. URL со схемой `http://`, `https://`, `content://` и т.п.
   Ожидание: немедленный reject как `E_INVALID_PATH`.
   Окружение: `SIM`.

3. Security-scoped файл из `UIDocumentPicker` (Files provider).
   Ожидание: fallback ветка (`startAccessingSecurityScopedResource` + stream) успешно считает хэш.
   Окружение: `DEVICE` (ключевой кейс).

4. iCloud ubiquitous item, который не скачан локально.
   Ожидание: вызов запускает `startDownloadingUbiquitousItemAtURL`, возвращает контролируемую ошибку "retry later".
   Окружение: `DEVICE` (ключевой кейс).

5. Повторный хэш того же iCloud файла после завершения загрузки.
   Ожидание: успешный хэш без ошибок.
   Окружение: `DEVICE`.

6. Проверка маппинга ошибок `NSError -> RN`:
   `not found`, `permission denied`, `invalid path`, `io`.
   Ожидание: коды `E_FILE_NOT_FOUND` / `E_ACCESS_DENIED` / `E_INVALID_PATH` / `E_IO_ERROR`.
   Окружение: `BOTH` (часть сценариев только `DEVICE`).

### 10.3 Android-специфичные кейсы

1. `file://` и обычный filesystem path.
   Ожидание: успешный хэш в обоих движках.
   Окружение: `EMU`.

2. `content://` URI из Storage Access Framework / DocumentPicker.
   Ожидание: в zig-движке используется streaming (`zfh_hasher_*`), результат корректный.
   Окружение: `EMU` + подтверждение на `DEVICE`.

3. `content://` URI без grant/permission (или после revoke).
   Ожидание: контролируемая ошибка доступа (`E_ACCESS_DENIED`/`E_IO_ERROR`).
   Окружение: `EMU` + `DEVICE`.

4. Большой файл (например 200MB+).
   Ожидание: без OOM/ANR, UI остаётся отзывчивым, время выполнения приемлемое.
   Окружение: `DEVICE` (приоритетно), `EMU` как доп.проверка.

5. Параллельные запросы на разные файлы.
   Ожидание: корутины/ JNI состояния не конфликтуют, результаты корректны.
   Окружение: `EMU` + smoke на `DEVICE`.

6. Проверка маппинга ошибок из native/JNI в JS коды.
   Ожидание: стабильные коды ошибок, без "unknown" там, где возможна точная причина.
   Окружение: `EMU`.

### 10.4 Что обязательно прогонять перед релизом

1. Полный набор `10.1` на `native` и `zig`.
2. iOS кейсы `10.2.3` и `10.2.4` на реальном iPhone/iPad.
3. Android кейс `10.3.2` на реальном устройстве с `content://` провайдером.
4. Большой файл (`10.3.4`) хотя бы на одном реальном Android-девайсе.
5. Smoke в Expo prebuild/EAS для обоих `engine`.

## Чеклист RN прототипа

- [x] Сделан C ABI wrapper (`https://github.com/Preeternal/zig-files-hash`)
- [x] Сборка iOS/Android артефактов
- [x] Мост JSI/TurboModule
- [x] Добавить проверку ABI/API версии при старте модуля (`zfh_api_version()` vs ожидаемая `ZFH_API_VERSION`)
- [x] Добавить тесты в RN-библиотеке на совместимость версии (успех при совпадении, понятная ошибка при несовпадении)
- [x] Зафиксировать формат результата в JS API: всегда lowercase hex
- [x] Обновить публичный API: `stringHash` основной, `hashString` оставлен как deprecated alias для миграции
- [x] Убрать `hmac` из `THashMode`, перевести HMAC в отдельные алгоритмы
- [x] Добавить в `native` engine недостающие алгоритмы из Zig ядра
- [x] Для `engine=zig` и `XXH3-128` вернуть явную ошибку
- [x] Отразить breaking changes и миграцию в README
- [x] Прогнаны тесты на одинаковый результат между Zig и JS слоем (JS boundary parity smoke с real Zig vectors)
