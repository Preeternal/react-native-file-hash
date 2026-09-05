const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const engineKey = 'ZFHEngine';
const engines = new Set(['native', 'zig']);

function zigCoreVersion() {
    const zonPath = path.join(
        packageRoot,
        'third_party',
        'zig-files-hash',
        'build.zig.zon'
    );
    const match = /version\s*=\s*"([^"]+)"/.exec(
        fs.readFileSync(zonPath, 'utf8')
    );
    return match == null ? 'unknown' : `v${match[1]}`;
}

function toSwiftPath(filePath) {
    return filePath.split(path.sep).join('/');
}

function readEngine(infoPlistPath) {
    const contents = fs.readFileSync(infoPlistPath, 'utf8');
    const match = new RegExp(
        `<key>\\s*${engineKey}\\s*</key>\\s*<string>\\s*([^<]+?)\\s*</string>`,
        'i'
    ).exec(contents);

    if (match == null) {
        return null;
    }

    const engine = match[1].trim().toLowerCase();
    if (!engines.has(engine)) {
        throw new Error(
            `${infoPlistPath} sets ${engineKey} to '${match[1].trim()}'; expected 'native' or 'zig'.`
        );
    }
    return engine;
}

function findInfoPlists(directory) {
    const found = [];
    const visit = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (
                entry.name === 'build' ||
                entry.name === 'Pods' ||
                entry.name.startsWith('.')
            ) {
                continue;
            }
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                visit(entryPath);
            } else if (entry.isFile() && entry.name === 'Info.plist') {
                found.push(entryPath);
            }
        }
    };
    if (fs.existsSync(directory)) {
        visit(directory);
    }
    return found;
}

function selectedEngine(projectRoot) {
    const infoPlists = findInfoPlists(projectRoot);
    const selections = infoPlists
        .map((infoPlistPath) => ({
            infoPlistPath,
            engine: readEngine(infoPlistPath),
        }))
        .filter((selection) => selection.engine != null);
    const uniqueEngines = [
        ...new Set(selections.map((selection) => selection.engine)),
    ];

    if (uniqueEngines.length > 1) {
        const details = selections
            .map(
                (selection) => `${selection.infoPlistPath}: ${selection.engine}`
            )
            .join(', ');
        throw new Error(
            `${engineKey} must select one engine per SPM app build. Found conflicting values: ${details}.`
        );
    }

    return {
        engine: uniqueEngines[0] ?? 'native',
        infoPlists,
    };
}

function sourceFiles(engine) {
    const common = [
        'ReactNative/FileHash.h',
        'ReactNative/FileHash.mm',
        'ReactNative/FileHashBridgeHelpers.h',
        'ReactNative/FileHashPromiseTypes.h',
        'ReactNative/FileHashBridgeHelpers.mm',
    ];
    return engine === 'zig'
        ? [
              ...common,
              'FileHashBridgeZig.h',
              'FileHashBridgeZig.mm',
              'FileHashZigHelpers.h',
              'FileHashZigHelpers.mm',
          ]
        : [
              ...common,
              'ReactNative/FileHashBridgeNative.h',
              'ReactNative/FileHashBridgeNative.m',
          ];
}

function renderManifest({
    engine,
    manifestRoot,
    xcframeworksPath,
    codegenPath,
}) {
    const reactHeaders = [
        '.product(name: "ReactHeaders", package: "ReactNative")',
        '.product(name: "ReactNativeHeaders", package: "ReactNative")',
        '.product(name: "ReactNativeDependenciesHeaders", package: "ReactNative")',
        '.product(name: "ReactAppHeaders", package: "React-GeneratedCode")',
    ];
    const relativeXcframeworksPath = toSwiftPath(
        path.relative(manifestRoot, xcframeworksPath)
    );
    const relativeCodegenPath = toSwiftPath(
        path.relative(manifestRoot, codegenPath)
    );
    const selectedSources = sourceFiles(engine)
        .map((file) => `        "${file}",`)
        .join('\n');
    const zigTarget =
        engine === 'zig'
            ? `    .binaryTarget(\n      name: "ZigFilesHash",\n      path: "root/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework"\n    ),\n`
            : '';
    const nativeTargets =
        engine === 'native'
            ? `    .target(
      name: "FileHashNativeCore",
      path: "root/ios/NativeCore",
      publicHeadersPath: ".",
      cSettings: [
        .headerSearchPath("../../third_party/xxhash"),
        .headerSearchPath("../../third_party/blake3/c"),
        .define("BLAKE3_NO_SSE2", to: "1"),
        .define("BLAKE3_NO_SSE41", to: "1"),
        .define("BLAKE3_NO_AVX2", to: "1"),
        .define("BLAKE3_NO_AVX512", to: "1"),
      ],
      cxxSettings: [
        .headerSearchPath("../../third_party/xxhash"),
        .headerSearchPath("../../third_party/blake3/c"),
        .define("BLAKE3_NO_SSE2", to: "1"),
        .define("BLAKE3_NO_SSE41", to: "1"),
        .define("BLAKE3_NO_AVX2", to: "1"),
        .define("BLAKE3_NO_AVX512", to: "1"),
      ]
    ),
    .target(
      name: "FileHashNative",
      dependencies: ["FileHashNativeCore"] + reactHeaders,
      path: "root/ios/NativeSwift",
      linkerSettings: [
        .linkedFramework("CryptoKit"),
        .linkedFramework("Foundation"),
        .linkedFramework("Security"),
      ]
    ),
`
            : '';
    const engineDependency =
        engine === 'zig' ? '"ZigFilesHash"' : '"FileHashNative"';
    const zigDefine =
        engine === 'zig' ? '        .define("ZFH_ENGINE_ZIG", to: "1"),\n' : '';
    const zigVersionDefine =
        engine === 'zig'
            ? `        .define("ZFH_ZIG_CORE_VERSION", to: "\\"${zigCoreVersion()}\\""),\n`
            : '';

    return `// swift-tools-version: 6.0
// AUTO-GENERATED by @preeternal/react-native-file-hash SPM autolinking. Do not edit.

import PackageDescription

let reactHeaders: [Target.Dependency] = [
  ${reactHeaders.join(',\n  ')},
]

let package = Package(
  name: "ReactNativeFileHash",
  platforms: [.iOS(.v15)],
  products: [
    .library(name: "ReactNativeFileHash", targets: ["ReactNativeFileHash"]),
  ],
  dependencies: [
    .package(name: "ReactNative", path: "${relativeXcframeworksPath}"),
    .package(name: "React-GeneratedCode", path: "${relativeCodegenPath}"),
  ],
  targets: [
${zigTarget}${nativeTargets}    .target(
      name: "ReactNativeFileHash",
      dependencies: [${engineDependency}] + reactHeaders,
      path: "root/ios",
      sources: [
${selectedSources}
      ],
      publicHeadersPath: "ReactNative",
      cSettings: [
        .headerSearchPath("ReactNative"),
        .headerSearchPath("."),
${zigDefine}${zigVersionDefine}      ],
      cxxSettings: [
        .headerSearchPath("ReactNative"),
        .headerSearchPath("."),
        .unsafeFlags([
          "-DFOLLY_NO_CONFIG",
          "-DFOLLY_MOBILE=1",
          "-DFOLLY_USE_LIBCPP=1",
          "-DFOLLY_CFG_NO_COROUTINES=1",
          "-DFOLLY_HAVE_CLOCK_GETTIME=1",
          "-Wno-comma",
          "-Wno-shorten-64-to-32",
          "-DRN_FABRIC_ENABLED",
          "-fno-modules",
        ]),
${zigDefine}${zigVersionDefine}        .define("DEBUG", .when(configuration: .debug)),
        .define("NDEBUG", .when(configuration: .release)),
      ],
      linkerSettings: [
        .linkedFramework("Foundation"),
      ]
    ),
  ],
  swiftLanguageModes: [.v5],
  cxxLanguageStandard: .cxx20
)
`;
}

module.exports = function fileHashSpmAutolinkingPlugin(context) {
    const iosRoot =
        context.autolinking?.project?.ios?.sourceDir ||
        path.join(context.appRoot, 'ios');
    const { engine, infoPlists } = selectedEngine(iosRoot);
    const manifestRoot = path.join(
        context.outputDir,
        'plugins',
        'ReactNativeFileHash'
    );
    const xcframeworksPath = path.join(iosRoot, 'build', 'xcframeworks');
    const codegenPath = path.join(iosRoot, 'build', 'generated', 'ios');

    fs.rmSync(manifestRoot, { recursive: true, force: true });
    fs.mkdirSync(manifestRoot, { recursive: true });
    fs.symlinkSync(packageRoot, path.join(manifestRoot, 'root'), 'dir');
    fs.writeFileSync(
        path.join(manifestRoot, 'Package.swift'),
        renderManifest({ engine, manifestRoot, xcframeworksPath, codegenPath }),
        'utf8'
    );

    return {
        packageDependencies: [
            { name: 'ReactNativeFileHash', path: manifestRoot },
        ],
        productDependencies: [
            { name: 'ReactNativeFileHash', package: 'ReactNativeFileHash' },
        ],
        watchPaths: [
            path.join(packageRoot, 'Package.swift'),
            path.join(packageRoot, 'scripts', 'spm-autolinking-plugin.js'),
            ...infoPlists,
        ],
    };
};
