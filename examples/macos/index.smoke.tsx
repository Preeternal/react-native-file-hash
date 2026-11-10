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

const algorithms: THashAlgorithm[] = [
    'MD5',
    'SHA-1',
    'SHA-224',
    'SHA-256',
    'SHA-384',
    'SHA-512',
    'SHA-512/224',
    'SHA-512/256',
    'XXH3-64',
    'BLAKE3',
    'HMAC-SHA-224',
    'HMAC-SHA-256',
    'HMAC-SHA-384',
    'HMAC-SHA-512',
    'HMAC-MD5',
    'HMAC-SHA-1',
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

    for (const algorithm of algorithms) {
        const digest = await stringHash(smokeText, {
            algorithm,
            hashOptions: hashOptionsFor(algorithm),
        });
        assertSmoke(
            /^[0-9a-f]+$/.test(digest),
            `${algorithm} returned an invalid digest: ${digest}`
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
