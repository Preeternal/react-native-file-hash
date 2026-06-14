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

type HashAbortError = Error & {
    code: 'E_CANCELLED';
    name: 'AbortError';
    reason?: unknown;
};

type LegacyHashOptions = HashOptions & {
    mode?: unknown;
};

export type HashAbortSignal = {
    readonly aborted: boolean;
    readonly reason?: unknown;
    addEventListener(
        type: 'abort',
        listener: () => void,
        options?: { once?: boolean }
    ): void;
    removeEventListener(type: 'abort', listener: () => void): void;
};

export type HashRequest = {
    algorithm?: THashAlgorithm;
    hashOptions?: HashOptions;
    signal?: HashAbortSignal;
};

export type StringHashRequest = HashRequest & {
    encoding?: THashEncoding;
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

const DEFAULT_ALGORITHM: THashAlgorithm = 'SHA-256';

const isHmacAlgorithm = (
    algorithm: THashAlgorithm
): algorithm is HmacAlgorithm =>
    (HMAC_ALGORITHMS as readonly THashAlgorithm[]).includes(algorithm);

let didWarnHashStringDeprecation = false;
let nextOperationId = 0;

const createInvalidArgumentError = (message: string): InvalidArgumentError => {
    const error = new Error(message) as InvalidArgumentError;
    error.code = 'E_INVALID_ARGUMENT';
    return error;
};

const createAbortError = (reason?: unknown): HashAbortError => {
    const message =
        typeof reason === 'string' ? reason : 'Hash operation aborted';
    const error = new Error(message) as HashAbortError;
    error.name = 'AbortError';
    error.code = 'E_CANCELLED';
    error.reason = reason;
    return error;
};

const normalizeAbortError = (error: unknown): unknown => {
    if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'E_CANCELLED'
    ) {
        const abortError = error as HashAbortError;
        abortError.name = 'AbortError';
    }

    return error;
};

const createOperationId = (): string => {
    nextOperationId += 1;
    return `file-hash:${nextOperationId}`;
};

const runWithAbortSignal = async <T,>(
    signal: HashAbortSignal | undefined,
    start: (operationId?: string) => Promise<T>
): Promise<T> => {
    if (signal === undefined) {
        return start();
    }

    if (signal.aborted) {
        throw createAbortError(signal.reason);
    }

    const operationId = createOperationId();
    const abortNativeOperation = (): void => {
        try {
            FileHash.cancelOperation(operationId);
        } catch {
            // Native may already be torn down; promise cleanup below still runs.
        }
    };

    signal.addEventListener('abort', abortNativeOperation, { once: true });
    try {
        if (signal.aborted) {
            abortNativeOperation();
            throw createAbortError(signal.reason);
        }

        return await start(operationId);
    } catch (error) {
        throw normalizeAbortError(error);
    } finally {
        signal.removeEventListener('abort', abortNativeOperation);
    }
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

const isRequestObject = (value: unknown): value is HashRequest =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeFileHashRequest = (
    algorithmOrRequest?: THashAlgorithm | HashRequest,
    options?: HashOptions
): Required<Pick<HashRequest, 'algorithm'>> &
    Pick<HashRequest, 'hashOptions' | 'signal'> => {
    if (isRequestObject(algorithmOrRequest)) {
        return {
            algorithm: algorithmOrRequest.algorithm ?? DEFAULT_ALGORITHM,
            hashOptions: algorithmOrRequest.hashOptions,
            signal: algorithmOrRequest.signal,
        };
    }

    return {
        algorithm: algorithmOrRequest ?? DEFAULT_ALGORITHM,
        hashOptions: options,
        signal: undefined,
    };
};

const normalizeStringHashRequest = (
    algorithmOrRequest?: THashAlgorithm | StringHashRequest,
    encoding?: THashEncoding,
    options?: HashOptions
): Required<Pick<StringHashRequest, 'algorithm' | 'encoding'>> &
    Pick<StringHashRequest, 'hashOptions' | 'signal'> => {
    if (isRequestObject(algorithmOrRequest)) {
        const request = algorithmOrRequest as StringHashRequest;
        return {
            algorithm: request.algorithm ?? DEFAULT_ALGORITHM,
            encoding: request.encoding ?? 'utf8',
            hashOptions: request.hashOptions,
            signal: request.signal,
        };
    }

    return {
        algorithm: algorithmOrRequest ?? DEFAULT_ALGORITHM,
        encoding: encoding ?? 'utf8',
        hashOptions: options,
        signal: undefined,
    };
};

const nativeFileHash = (
    filePath: string,
    algorithm: THashAlgorithm,
    options: NativeHashOptions,
    operationId?: string
): Promise<string> => {
    return FileHash.fileHash(filePath, algorithm, options, operationId);
};

const nativeStringHash = (
    text: string,
    algorithm: THashAlgorithm,
    encoding: THashEncoding,
    options: NativeHashOptions,
    operationId?: string
): Promise<string> => {
    return FileHash.stringHash(text, algorithm, encoding, options, operationId);
};

/**
 * Calculates the hash of a file.
 * @param filePath The path to the file.
 * @param request Request options: algorithm, hashOptions, signal.
 * Output format is fixed: lowercase hex string.
 * @returns A promise that resolves with a lowercase hex digest string.
 */
export function fileHash(
    filePath: string,
    request?: HashRequest
): Promise<string>;
/**
 * @deprecated Use object-style request: fileHash(filePath, { algorithm, hashOptions, signal }).
 */
export function fileHash(
    filePath: string,
    algorithm?: THashAlgorithm,
    options?: HashOptions
): Promise<string>;
export async function fileHash(
    filePath: string,
    algorithmOrRequest?: THashAlgorithm | HashRequest,
    options?: HashOptions
): Promise<string> {
    const request = normalizeFileHashRequest(algorithmOrRequest, options);
    const normalized = validateAndNormalizeOptions(
        request.algorithm,
        request.hashOptions
    );

    return runWithAbortSignal(request.signal, (operationId) =>
        nativeFileHash(filePath, request.algorithm, normalized, operationId)
    );
}

/**
 * Calculates the hash of a string. For large payloads prefer `fileHash` to avoid keeping all data in JS memory.
 * @param text The input string or base64-encoded data.
 * @param request Request options: algorithm, encoding, hashOptions, signal.
 * Output format is fixed: lowercase hex string.
 * @returns A promise that resolves with a lowercase hex digest string.
 */
export function stringHash(
    text: string,
    request?: StringHashRequest
): Promise<string>;
/**
 * @deprecated Use object-style request: stringHash(text, { algorithm, encoding, hashOptions, signal }).
 */
export function stringHash(
    text: string,
    algorithm?: THashAlgorithm,
    encoding?: THashEncoding,
    options?: HashOptions
): Promise<string>;
export async function stringHash(
    text: string,
    algorithmOrRequest?: THashAlgorithm | StringHashRequest,
    encoding?: THashEncoding,
    options?: HashOptions
): Promise<string> {
    const request = normalizeStringHashRequest(
        algorithmOrRequest,
        encoding,
        options
    );
    const normalized = validateAndNormalizeOptions(
        request.algorithm,
        request.hashOptions
    );

    return runWithAbortSignal(request.signal, (operationId) =>
        nativeStringHash(
            text,
            request.algorithm,
            request.encoding,
            normalized,
            operationId
        )
    );
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
    HashAbortError,
    InvalidArgumentError,
    RuntimeInfo,
    RuntimeDiagnostics,
};
