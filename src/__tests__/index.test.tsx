import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import FileHash, { type THashAlgorithm } from '../NativeFileHash';
import {
    fileHash,
    hashString,
    getRuntimeDiagnostics,
    getRuntimeInfo,
    stringHash,
    type HashAbortSignal,
} from '../index';

const castAlgo = (s: string) => s as THashAlgorithm;
const VECTORED_INPUT = 'Hello, world!';

const ZIG_STRING_VECTORS: Record<string, string> = {
    'SHA-224': '8552d8b7a7dc5476cb9e25dee69a8091290764b7f2a64fe6e78e9568',
    'SHA-256':
        '315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3',
    'SHA-384':
        '55bc556b0d2fe0fce582ba5fe07baafff035653638c7ac0d5494c2a64c0bea1cc57331c7c12a45cdbca7f4c34a089eeb',
    'SHA-512':
        'c1527cd893c124773d811911970c8fe6e857d6df5dc9226bd8a160614c0cd963a4ddea2b94bb7d36021ef9d865d5cea294a82dd49a0bb269f51f6e7a57f79421',
    'SHA-512/224': '32620068b859669b45b31008e08b7384649ad2ca3f5163a3a71e5745',
    'SHA-512/256':
        '330c723f25267587db0b9f493463e017011239169cb57a6db216c63774367115',
    'MD5': '6cd3556deb0da54bca060b4c39479839',
    'SHA-1': '943a702d06f34599aee1f8da8ef9f7296031d699',
    'XXH3-64': 'f3c34bf11915e869',
    'BLAKE3':
        'ede5c0b10f2ec4979c69b52f61e42ff5b413519ce09be0f14d098dcfe5f6f98d',
    'BLAKE3-KEYED':
        '656dacfe03aa3535691b2c181a116a7ed158156b622e8ceb6e6833dca857e3d8',
    'HMAC-SHA-256':
        '62aedf0125252922581bf109e6efc01ee2fbef97f9d60f5c065ce4a25e75273b',
};

const DEFAULT_HMAC_KEY = 'my_secret_key';
const DEFAULT_BLAKE3_KEY =
    '3031323334353637383961626364656630313233343536373839616263646566';
const mockedFileHash = jest.mocked(FileHash.fileHash);
const mockedStringHash = jest.mocked(FileHash.stringHash);
const mockedCancelOperation = jest.mocked(FileHash.cancelOperation);
const mockedGetRuntimeInfo = jest.mocked(FileHash.getRuntimeInfo);
const mockedGetRuntimeDiagnostics = jest.mocked(FileHash.getRuntimeDiagnostics);

const vectorForRequest = (
    algorithm: string,
    options?: Record<string, unknown>
) => {
    if (algorithm === 'BLAKE3' && options?.key !== undefined) {
        return ZIG_STRING_VECTORS['BLAKE3-KEYED']!;
    }
    const vector = ZIG_STRING_VECTORS[algorithm];
    if (!vector) {
        throw new Error(`Missing vector for algorithm: ${algorithm}`);
    }
    return vector;
};

const createMockAbortController = () => {
    let abortListener: (() => void) | undefined;
    const signal = {
        aborted: false as boolean,
        reason: undefined as unknown,
        addEventListener: jest.fn((_type: 'abort', listener: () => void) => {
            abortListener = listener;
        }),
        removeEventListener: jest.fn((_type: 'abort', listener: () => void) => {
            if (abortListener === listener) {
                abortListener = undefined;
            }
        }),
    } satisfies HashAbortSignal;

    return {
        signal,
        abort(reason?: unknown) {
            signal.aborted = true;
            signal.reason = reason;
            abortListener?.();
        },
    };
};

describe('fileHash options validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('passes defaults when options omitted', async () => {
        await fileHash('path');
        expect(FileHash.fileHash).toHaveBeenCalledWith(
            'path',
            'SHA-256',
            {},
            undefined
        );
    });

    it('requires key for HMAC algorithms', async () => {
        await expect(fileHash('p', castAlgo('HMAC-SHA-256'))).rejects.toThrow(
            /Key is required/
        );
    });

    it('accepts HMAC algorithm and preserves key options', async () => {
        await fileHash('p', castAlgo('HMAC-SHA-256'), {
            key: 'secret',
            keyEncoding: 'utf8',
        });
        expect(FileHash.fileHash).toHaveBeenCalledWith(
            'p',
            'HMAC-SHA-256',
            {
                key: 'secret',
                keyEncoding: 'utf8',
            },
            undefined
        );
    });

    it('accepts keyed BLAKE3 with key (auto mode)', async () => {
        const hexKey = 'aa'.repeat(32);
        await fileHash('p', castAlgo('BLAKE3'), {
            key: hexKey,
            keyEncoding: 'hex',
        });
        expect(FileHash.fileHash).toHaveBeenCalledWith(
            'p',
            'BLAKE3',
            {
                key: hexKey,
                keyEncoding: 'hex',
            },
            undefined
        );
    });

    it('accepts BLAKE3 without key (plain mode)', async () => {
        await fileHash('p', castAlgo('BLAKE3'));
        expect(FileHash.fileHash).toHaveBeenCalledWith(
            'p',
            'BLAKE3',
            {},
            undefined
        );
    });

    it('rejects key for non-HMAC and non-BLAKE3 algorithms', async () => {
        await expect(
            fileHash('p', castAlgo('SHA-256'), { key: 'secret' })
        ).rejects.toThrow(/Key is only used for HMAC algorithms or BLAKE3/);
    });

    it('rejects removed legacy mode option with E_INVALID_ARGUMENT', async () => {
        await expect(
            fileHash('p', castAlgo('SHA-256'), { mode: 'hmac' } as any)
        ).rejects.toMatchObject({
            code: 'E_INVALID_ARGUMENT',
            message: expect.stringContaining('`mode` option was removed'),
        });
    });

    it('accepts empty key for HMAC (key provided)', async () => {
        await fileHash('p', castAlgo('HMAC-SHA-256'), { key: '' });
        expect(FileHash.fileHash).toHaveBeenCalledWith(
            'p',
            'HMAC-SHA-256',
            {
                key: '',
                keyEncoding: 'utf8',
            },
            undefined
        );
    });
});

describe('stringHash mirrors validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('uses defaults when options omitted', async () => {
        await stringHash('abc');
        expect(FileHash.stringHash).toHaveBeenCalledWith(
            'abc',
            'SHA-256',
            'utf8',
            {},
            undefined
        );
    });

    it('rejects missing key for HMAC algorithm', async () => {
        await expect(
            stringHash('abc', castAlgo('HMAC-SHA-256'))
        ).rejects.toThrow(/Key is required/);
    });

    it('accepts empty string input', async () => {
        await stringHash('', castAlgo('SHA-256'));
        expect(FileHash.stringHash).toHaveBeenCalledWith(
            '',
            'SHA-256',
            'utf8',
            {},
            undefined
        );
    });

    it('accepts long HMAC key without length restriction', async () => {
        const longKey = 'a'.repeat(512);
        await stringHash('abc', castAlgo('HMAC-SHA-256'), 'utf8', {
            key: longKey,
        });
        expect(FileHash.stringHash).toHaveBeenCalledWith(
            'abc',
            'HMAC-SHA-256',
            'utf8',
            { key: longKey, keyEncoding: 'utf8' },
            undefined
        );
    });

    it('rejects removed legacy mode option with E_INVALID_ARGUMENT', async () => {
        await expect(
            stringHash('abc', castAlgo('SHA-256'), 'utf8', {
                mode: 'hmac',
            } as any)
        ).rejects.toMatchObject({
            code: 'E_INVALID_ARGUMENT',
            message: expect.stringContaining('`mode` option was removed'),
        });
    });
});

describe('HashRequest object API and cancellation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('uses default file algorithm when request is omitted', async () => {
        await fileHash('path', {});
        expect(FileHash.fileHash).toHaveBeenCalledWith(
            'path',
            'SHA-256',
            {},
            undefined
        );
    });

    it('passes object-style file request hash options', async () => {
        await fileHash('p', {
            algorithm: castAlgo('HMAC-SHA-256'),
            hashOptions: {
                key: 'secret',
                keyEncoding: 'utf8',
            },
        });

        expect(FileHash.fileHash).toHaveBeenCalledWith(
            'p',
            'HMAC-SHA-256',
            {
                key: 'secret',
                keyEncoding: 'utf8',
            },
            undefined
        );
    });

    it('uses default string algorithm and encoding when request fields are omitted', async () => {
        await stringHash('abc', {});
        expect(FileHash.stringHash).toHaveBeenCalledWith(
            'abc',
            'SHA-256',
            'utf8',
            {},
            undefined
        );
    });

    it('passes object-style string request encoding and hash options', async () => {
        await stringHash('abc', {
            algorithm: castAlgo('HMAC-SHA-256'),
            encoding: 'base64',
            hashOptions: {
                key: 'secret',
            },
        });

        expect(FileHash.stringHash).toHaveBeenCalledWith(
            'abc',
            'HMAC-SHA-256',
            'base64',
            { key: 'secret', keyEncoding: 'utf8' },
            undefined
        );
    });

    it('rejects before native call when signal is already aborted', async () => {
        const controller = createMockAbortController();
        controller.abort('stop');

        await expect(
            fileHash('p', { signal: controller.signal })
        ).rejects.toMatchObject({
            code: 'E_CANCELLED',
            name: 'AbortError',
            message: 'stop',
        });
        expect(FileHash.fileHash).not.toHaveBeenCalled();
        expect(FileHash.cancelOperation).not.toHaveBeenCalled();
    });

    it('cancels native operation when signal aborts during file hash', async () => {
        const controller = createMockAbortController();
        let rejectNative:
            | ((error: Error & { code: string }) => void)
            | undefined;
        mockedFileHash.mockImplementationOnce(
            async () =>
                new Promise<string>((_resolve, reject) => {
                    rejectNative = reject;
                })
        );

        const promise = fileHash('p', { signal: controller.signal });
        controller.abort();

        expect(mockedCancelOperation).toHaveBeenCalledTimes(1);
        expect(mockedCancelOperation.mock.calls[0]?.[0]).toEqual(
            expect.stringMatching(/^file-hash:/)
        );

        rejectNative?.(
            Object.assign(new Error('Hash computation cancelled'), {
                code: 'E_CANCELLED',
            })
        );

        await expect(promise).rejects.toMatchObject({
            code: 'E_CANCELLED',
            name: 'AbortError',
        });
        expect(controller.signal.removeEventListener).toHaveBeenCalled();
    });
});

describe('hashString deprecated alias', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('warns once in dev mode', async () => {
        const warnSpy = jest
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined);
        try {
            await hashString('abc', castAlgo('SHA-256'));
            await hashString('def', castAlgo('SHA-256'));
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0]?.[0]).toContain(
                '`hashString` is deprecated'
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('forwards to native stringHash', async () => {
        const digest = await hashString('abc', castAlgo('SHA-256'));
        expect(digest).toBe('616263');
        expect(FileHash.stringHash).toHaveBeenCalledWith(
            'abc',
            'SHA-256',
            'utf8',
            {},
            undefined
        );
    });
});

describe('zig API compatibility errors', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('passes through native compatibility error for fileHash', async () => {
        mockedFileHash.mockRejectedValueOnce(
            Object.assign(
                new Error(
                    'Incompatible Zig C API version: runtime=2 expected=1'
                ),
                {
                    code: 'E_INCOMPATIBLE_ZIG_API',
                }
            )
        );

        await expect(fileHash('p', castAlgo('SHA-256'))).rejects.toMatchObject({
            code: 'E_INCOMPATIBLE_ZIG_API',
            message: expect.stringContaining('Incompatible Zig C API version'),
        });
    });

    it('passes through native compatibility error for stringHash', async () => {
        mockedStringHash.mockRejectedValueOnce(
            Object.assign(
                new Error(
                    'Incompatible Zig C API version: runtime=3 expected=1'
                ),
                {
                    code: 'E_INCOMPATIBLE_ZIG_API',
                }
            )
        );

        await expect(
            stringHash('abc', castAlgo('SHA-256'))
        ).rejects.toMatchObject({
            code: 'E_INCOMPATIBLE_ZIG_API',
            message: expect.stringContaining('Incompatible Zig C API version'),
        });
    });
});

describe('zig vectors parity on JS boundary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedStringHash.mockImplementation(
            async (
                _text: string,
                algorithm: string,
                _encoding?: string,
                options?: Record<string, unknown>
            ) => vectorForRequest(algorithm, options)
        );
    });

    it('returns exact zig hex vectors for plain and truncated SHA algorithms', async () => {
        const plainAlgorithms = [
            'SHA-224',
            'SHA-256',
            'SHA-384',
            'SHA-512',
            'MD5',
            'SHA-1',
            'XXH3-64',
            'BLAKE3',
        ];

        for (const algorithm of plainAlgorithms) {
            const digest = await stringHash(
                VECTORED_INPUT,
                castAlgo(algorithm)
            );
            expect(digest).toBe(ZIG_STRING_VECTORS[algorithm]);
        }
    });

    it('returns exact zig hex vectors for SHA-512/224 and SHA-512/256', async () => {
        const sha512_224 = await stringHash(
            VECTORED_INPUT,
            castAlgo('SHA-512/224')
        );
        expect(sha512_224).toBe(ZIG_STRING_VECTORS['SHA-512/224']);

        const sha512_256 = await stringHash(
            VECTORED_INPUT,
            castAlgo('SHA-512/256')
        );
        expect(sha512_256).toBe(ZIG_STRING_VECTORS['SHA-512/256']);
    });

    it('returns exact zig hex vectors for HMAC and keyed BLAKE3', async () => {
        const hmacDigest = await stringHash(
            VECTORED_INPUT,
            castAlgo('HMAC-SHA-256'),
            'utf8',
            {
                key: DEFAULT_HMAC_KEY,
                keyEncoding: 'utf8',
            }
        );
        expect(hmacDigest).toBe(ZIG_STRING_VECTORS['HMAC-SHA-256']);

        const keyedDigest = await stringHash(
            VECTORED_INPUT,
            castAlgo('BLAKE3'),
            'utf8',
            {
                key: DEFAULT_BLAKE3_KEY,
                keyEncoding: 'hex',
            }
        );
        expect(keyedDigest).toBe(ZIG_STRING_VECTORS['BLAKE3-KEYED']);
    });
});

describe('runtime info', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns runtime engine from native module', async () => {
        await expect(getRuntimeInfo()).resolves.toEqual({
            engine: 'zig',
        });
        expect(mockedGetRuntimeInfo.mock.calls).toHaveLength(1);
    });

    it('returns runtime diagnostics from native module', async () => {
        await expect(getRuntimeDiagnostics()).resolves.toEqual({
            engine: 'zig',
            zigApiVersion: 3,
            zigExpectedApiVersion: 3,
            zigApiCompatible: true,
            zigVersion: 'v0.0.5',
        });
        expect(mockedGetRuntimeDiagnostics.mock.calls).toHaveLength(1);
    });

    it('normalizes native runtime diagnostics to the public native shape', async () => {
        mockedGetRuntimeDiagnostics.mockResolvedValueOnce({
            engine: 'native',
            zigApiVersion: 0,
            zigExpectedApiVersion: 0,
            zigApiCompatible: false,
            zigVersion: 'n/a',
        });

        await expect(getRuntimeDiagnostics()).resolves.toEqual({
            engine: 'native',
        });
    });

    it('runtime info and diagnostics can be requested independently', async () => {
        await getRuntimeInfo();
        await getRuntimeDiagnostics();

        await expect(getRuntimeInfo()).resolves.toEqual({
            engine: 'zig',
        });
        expect(mockedGetRuntimeInfo.mock.calls).toHaveLength(2);
        expect(mockedGetRuntimeDiagnostics.mock.calls).toHaveLength(1);
    });

    it('forwards diagnostics errors', async () => {
        mockedGetRuntimeDiagnostics.mockRejectedValueOnce(
            new Error('Diagnostics unavailable')
        );
        await expect(getRuntimeDiagnostics()).rejects.toThrow(
            'Diagnostics unavailable'
        );
    });
});
