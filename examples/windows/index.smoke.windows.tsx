import { useEffect } from 'react';
import { AppRegistry, Text } from 'react-native';
import {
    fileHash,
    getRuntimeDiagnostics,
    getRuntimeInfo,
    stringHash,
    xxh3SeedFromLabel,
    type THashAlgorithm,
} from '@preeternal/react-native-file-hash';
import BenchmarkFile from './specs/NativeBenchmarkFile';
import { name as appName } from './app.json';

// Reuse the macOS reference input and digests so both desktop CI jobs exercise
// the native implementations against the same known vectors.
const smokeText = 'react-native-file-hash macOS smoke';
const smokeFileSize = 1024 * 1024;
const stringVectors: readonly [THashAlgorithm, string][] = [
    ['MD5', 'e7952c0298042398e9386cb5b2558089'],
    ['SHA-1', '09a59bac17528886e93114ee1230a0feeed56bc5'],
    [
        'SHA-256',
        'ac2c3f46e9952e705941b3fb228a5f6c378d6da63c116cdfb1e6d5604970ba02',
    ],
    ['XXH3-64', 'd9b74343abcefac4'],
    [
        'BLAKE3',
        '587c1badd347ba7063452d3a552509ad79e3ef4d823bf2049c0ad21f98fe8eeb',
    ],
    [
        'HMAC-SHA-256',
        '0c71ca138f5cf87d1b287cec15c5d13b44c32f92d60f221dba5062344ef8b841',
    ],
];

function assertSmoke(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

async function runSmoke(): Promise<void> {
    const runtimeInfo = await getRuntimeInfo();
    assertSmoke(
        runtimeInfo.engine === 'zig',
        `Expected Zig runtime, got ${runtimeInfo.engine}`
    );

    const diagnostics = await getRuntimeDiagnostics();
    assertSmoke(
        diagnostics.engine === 'zig' && diagnostics.zigApiCompatible,
        `Incompatible Zig runtime: ${JSON.stringify(diagnostics)}`
    );

    for (const [algorithm, expected] of stringVectors) {
        const hashOptions = algorithm.startsWith('HMAC-')
            ? { key: 'macos-smoke-key', keyEncoding: 'utf8' as const }
            : algorithm === 'XXH3-64'
              ? { seed: xxh3SeedFromLabel('macos-ci') }
              : undefined;
        const digest = await stringHash(smokeText, { algorithm, hashOptions });
        assertSmoke(
            digest === expected,
            `${algorithm} mismatch: expected ${expected}, got ${digest}`
        );
    }

    const filePath = await BenchmarkFile.createFile(smokeFileSize);
    const sha256 = await fileHash(filePath, {
        algorithm: 'SHA-256',
        mmap: true,
    });
    assertSmoke(
        sha256 ===
            'fbbab289f7f94b25736c58be46a994c441fd02552cc6022352e3d86d2fab7c83',
        `File SHA-256 mismatch: ${sha256}`
    );

    const md5 = await fileHash(filePath, { algorithm: 'MD5' });
    assertSmoke(
        md5 === 'c35cc7d8d91728a0cb052831bc4ef372',
        `File MD5 mismatch: ${md5}`
    );
}

function SmokeApp() {
    useEffect(() => {
        runSmoke().then(
            () => {
                BenchmarkFile.log(
                    'Windows string and file hash vectors passed'
                );
                BenchmarkFile.finish(0);
            },
            (error: unknown) => {
                const message =
                    error instanceof Error ? error.message : String(error);
                BenchmarkFile.log(`FILE_HASH_WINDOWS_SMOKE_FAIL ${message}`);
                BenchmarkFile.finish(1);
            }
        );
    }, []);

    return <Text>Running FileHash Windows smoke test...</Text>;
}

AppRegistry.registerComponent(appName, () => SmokeApp);
