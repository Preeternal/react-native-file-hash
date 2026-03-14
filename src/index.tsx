import FileHash, {
    type THashAlgorithm,
    type HashOptions,
    type THashEncoding,
    type TKeyEncoding,
    type RuntimeInfo,
    type RuntimeDiagnostics as NativeRuntimeDiagnostics,
} from './NativeFileHash';

type HmacAlgorithm = Extract<
    THashAlgorithm,
    | 'HMAC-SHA-224'
    | 'HMAC-SHA-256'
    | 'HMAC-SHA-384'
    | 'HMAC-SHA-512'
    | 'HMAC-MD5'
    | 'HMAC-SHA-1'
>;

type NativeHashOptions = {
    key?: string;
    keyEncoding?: TKeyEncoding;
};

type InvalidArgumentError = Error & { code: 'E_INVALID_ARGUMENT' };

type LegacyHashOptions = HashOptions & {
    mode?: unknown;
};

type ZigRuntimeDiagnostics = {
    engine: 'zig';
    zigApiVersion: number;
    zigExpectedApiVersion: number;
    zigApiCompatible: boolean;
    zigVersion: string;
};

type RuntimeDiagnostics = { engine: 'native' } | ZigRuntimeDiagnostics;

const HMAC_ALGORITHMS: ReadonlyArray<HmacAlgorithm> = [
    'HMAC-SHA-224',
    'HMAC-SHA-256',
    'HMAC-SHA-384',
    'HMAC-SHA-512',
    'HMAC-MD5',
    'HMAC-SHA-1',
] as const;

const isHmacAlgorithm = (
    algorithm: THashAlgorithm
): algorithm is HmacAlgorithm =>
    (HMAC_ALGORITHMS as readonly THashAlgorithm[]).includes(algorithm);

let didWarnHashStringDeprecation = false;

const createInvalidArgumentError = (message: string): InvalidArgumentError => {
    const error = new Error(message) as InvalidArgumentError;
    error.code = 'E_INVALID_ARGUMENT';
    return error;
};

const warnHashStringDeprecationOnce = (): void => {
    if (didWarnHashStringDeprecation) return;

    const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
    if (!isDev) return;

    didWarnHashStringDeprecation = true;
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(
            '`hashString` is deprecated and will be removed in a future release. Use `stringHash`.'
        );
    }
};

const validateAndNormalizeOptions = (
    algorithm: THashAlgorithm,
    options?: HashOptions
): NativeHashOptions => {
    const legacyMode = (options as LegacyHashOptions | undefined)?.mode;
    if (legacyMode !== undefined) {
        throw createInvalidArgumentError(
            '`mode` option was removed. Use HMAC-* algorithms or BLAKE3 with `key`.'
        );
    }

    const keyEncoding: TKeyEncoding = options?.keyEncoding ?? 'utf8';
    const key = options?.key;
    const hasKey = key !== undefined;

    if (isHmacAlgorithm(algorithm)) {
        if (!hasKey) {
            throw createInvalidArgumentError(
                `Key is required for ${algorithm}`
            );
        }
        return { key, keyEncoding };
    }

    if (algorithm === 'BLAKE3') {
        if (hasKey) {
            return { key, keyEncoding };
        }
        return {};
    }

    if (hasKey) {
        throw createInvalidArgumentError(
            'Key is only used for HMAC algorithms or BLAKE3'
        );
    }

    return {};
};

const normalizeRuntimeDiagnostics = (
    diagnostics: NativeRuntimeDiagnostics
): RuntimeDiagnostics => {
    if (diagnostics.engine === 'zig') {
        return diagnostics;
    }

    return { engine: 'native' };
};

/**
 * Calculates the hash of a file.
 * @param filePath The path to the file.
 * @param algorithm The hash algorithm to use.
 * @param options Hash options: key, keyEncoding ('utf8' | 'hex' | 'base64').
 * Output format is fixed: lowercase hex string.
 * @returns A promise that resolves with a lowercase hex digest string.
 */
export async function fileHash(
    filePath: string,
    algorithm: THashAlgorithm = 'SHA-256',
    options?: HashOptions
): Promise<string> {
    const normalized = validateAndNormalizeOptions(algorithm, options);
    return FileHash.fileHash(filePath, algorithm, normalized);
}

/**
 * Calculates the hash of a string. For large payloads prefer `fileHash` to avoid keeping all data in JS memory.
 * @param text The input string or base64-encoded data.
 * @param algorithm The hash algorithm to use.
 * @param encoding Input encoding: 'utf8' (default) or 'base64'.
 * @param options Hash options: key, keyEncoding ('utf8' | 'hex' | 'base64').
 * Output format is fixed: lowercase hex string.
 * @returns A promise that resolves with a lowercase hex digest string.
 */
export async function stringHash(
    text: string,
    algorithm: THashAlgorithm = 'SHA-256',
    encoding: THashEncoding = 'utf8',
    options?: HashOptions
): Promise<string> {
    const normalized = validateAndNormalizeOptions(algorithm, options);
    return FileHash.stringHash(text, algorithm, encoding, normalized);
}

/**
 * @deprecated Use `stringHash` instead.
 */
export function hashString(
    text: string,
    algorithm: THashAlgorithm = 'SHA-256',
    encoding: THashEncoding = 'utf8',
    options?: HashOptions
): Promise<string> {
    warnHashStringDeprecationOnce();
    return stringHash(text, algorithm, encoding, options);
}

/**
 * Returns the currently selected runtime engine.
 */
export function getRuntimeInfo(): Promise<RuntimeInfo> {
    return FileHash.getRuntimeInfo();
}

/**
 * Returns detailed runtime diagnostics (engine + Zig ABI/core metadata).
 */
export function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
    return FileHash.getRuntimeDiagnostics().then(normalizeRuntimeDiagnostics);
}

export type {
    THashAlgorithm,
    THashEncoding,
    TKeyEncoding,
    HashOptions,
    InvalidArgumentError,
    RuntimeInfo,
    RuntimeDiagnostics,
};
