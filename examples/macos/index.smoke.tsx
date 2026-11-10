import { useEffect } from 'react';
import { AppRegistry, Text } from 'react-native';
import {
    fileHash,
    getRuntimeDiagnostics,
    getRuntimeInfo,
    stringHash,
    xxh3SeedFromLabel,
    type HashOptions,
    type THashAlgorithm,
} from '@preeternal/react-native-file-hash';
import BenchmarkFile from './specs/NativeBenchmarkFile';
import { name as appName } from './app.json';

const smokeText = 'react-native-file-hash macOS smoke';
const smokeFileSize = 1024 * 1024;
const smokeFileSha256 =
    'fbbab289f7f94b25736c58be46a994c441fd02552cc6022352e3d86d2fab7c83';
const smokeFileMd5 = 'c35cc7d8d91728a0cb052831bc4ef372';

// SHA/MD5/HMAC vectors use Node crypto (OpenSSL); XXH3/BLAKE3 use their
// reference C implementations, independently of the Zig engine under test.
// XXH3 uses the FNV-1a seed 0x59d5937584b8d1c9 derived from "macos-ci".
const stringVectors: readonly [THashAlgorithm, string][] = [
    ['MD5', 'e7952c0298042398e9386cb5b2558089'],
    ['SHA-1', '09a59bac17528886e93114ee1230a0feeed56bc5'],
    ['SHA-224', 'b490975b52f8f9a7ebefef5bf5b80fbf3715d5280c9c0e0b52ac7f18'],
    [
        'SHA-256',
        'ac2c3f46e9952e705941b3fb228a5f6c378d6da63c116cdfb1e6d5604970ba02',
    ],
    [
        'SHA-384',
        '848628aab3f856eca01b250a3fc0209b37c7dacb088eaea33dfbb8ddb06aa02547bbff2528246342ebbc02cb0035041d',
    ],
    [
        'SHA-512',
        '6567bda2108d7574eb5cd9bf969eac0c4fde0b70146bd3af9fb116f1a7d275e2686010b1abdb643fd2ecfc7e8ed3b89e1574f71996ffe7c37f856255feeb8524',
    ],
    ['SHA-512/224', 'fb41aead4fd8730e9f456517513667b3000170319889a732ad2e2b50'],
    [
        'SHA-512/256',
        'b18bc1616dcf459a30b14c046e39aeca40d4e4628bd8cc2fc702a312f652bc7a',
    ],
    ['XXH3-64', 'd9b74343abcefac4'],
    [
        'BLAKE3',
        '587c1badd347ba7063452d3a552509ad79e3ef4d823bf2049c0ad21f98fe8eeb',
    ],
    [
        'HMAC-SHA-224',
        '29175355124a6bbd9bd2af203e22059ff5ac5d19e6ea6cb604b7a8ff',
    ],
    [
        'HMAC-SHA-256',
        '0c71ca138f5cf87d1b287cec15c5d13b44c32f92d60f221dba5062344ef8b841',
    ],
    [
        'HMAC-SHA-384',
        'aef7e179a594f3dcc46c33a7a08ed4742d9f73163f55f2009293bb08e85466f06adec70583ea727bc1289e8c0a717701',
    ],
    [
        'HMAC-SHA-512',
        '240f41d0b401143939a140ac00dc951c764128cbb55d457abaa76b018676db57920010a64c0c483d40328cf3e6e532a876695cc860eb72ed6a40c2a62d87d54c',
    ],
    ['HMAC-MD5', 'fb7bf1aeed6c335db224fdf3b7828dd6'],
    ['HMAC-SHA-1', '20e4426e90e7cc1c10247d0fa8609927478ef72c'],
];

const errorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
};

const hashOptionsFor = (algorithm: THashAlgorithm): HashOptions | undefined => {
    if (algorithm.startsWith('HMAC-')) {
        return {
            key: 'macos-smoke-key',
            keyEncoding: 'utf8',
        };
    }

    if (algorithm === 'XXH3-64') {
        return { seed: xxh3SeedFromLabel('macos-ci') };
    }

    return undefined;
};

function assertSmoke(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

const runSmoke = async (): Promise<void> => {
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
        const digest = await stringHash(smokeText, {
            algorithm,
            hashOptions: hashOptionsFor(algorithm),
        });
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
    assertSmoke(sha256 === smokeFileSha256, `SHA-256 mismatch: ${sha256}`);

    const md5 = await fileHash(filePath, { algorithm: 'MD5' });
    assertSmoke(md5 === smokeFileMd5, `MD5 mismatch: ${md5}`);
};

function SmokeApp() {
    useEffect(() => {
        runSmoke().then(
            () => {
                BenchmarkFile.log('FILE_HASH_MACOS_SMOKE_PASS');
                BenchmarkFile.finish(0);
            },
            (error) => {
                BenchmarkFile.log(
                    `FILE_HASH_MACOS_SMOKE_FAIL ${errorMessage(error)}`
                );
                BenchmarkFile.finish(1);
            }
        );
    }, []);

    return <Text>Running FileHash macOS smoke test...</Text>;
}

AppRegistry.registerComponent(appName, () => SmokeApp);
