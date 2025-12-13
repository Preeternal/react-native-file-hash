import { Buffer } from 'buffer';
import FileHash, {
    type THashAlgorithm,
    type HashOptions,
    type THashEncoding,
    type THashMode,
    type TKeyEncoding,
} from './NativeFileHash';

type HmacCapable = Extract<
    THashAlgorithm,
    'SHA-224' | 'SHA-256' | 'SHA-384' | 'SHA-512'
>;

const decodeKey = (
    key: string,
    encoding: TKeyEncoding = 'utf8'
): Uint8Array => {
    if (!key) {
        throw new Error('Key is required for keyed/hmac modes');
    }
    switch (encoding) {
        case 'utf8': {
            const bufUtf8 = Buffer.from(key, 'utf8');
            return new Uint8Array(
                bufUtf8.buffer,
                bufUtf8.byteOffset,
                bufUtf8.length
            );
        }
        case 'hex': {
            const cleaned = key.replace(/\s+/g, '');
            if (cleaned.length % 2 !== 0) {
                throw new Error('Hex key length must be even');
            }
            const bytes = new Uint8Array(cleaned.length / 2);
            for (let i = 0; i < cleaned.length; i += 2) {
                bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
            }
            return bytes;
        }
        case 'base64': {
            const buf = Buffer.from(key, 'base64');
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
        }
        default:
            throw new Error(`Unsupported keyEncoding: ${encoding}`);
    }
};

const validateAndNormalizeOptions = (
    algorithm: THashAlgorithm,
    options?: HashOptions
): HashOptions & {
    mode: THashMode;
    key?: string;
    keyEncoding?: TKeyEncoding;
} => {
    const mode: THashMode = options?.mode ?? 'hash';

    if (mode === 'hash') {
        return { mode };
    }

    const keyEncoding: TKeyEncoding = options?.keyEncoding ?? 'utf8';
    const keyString = options?.key;

    if (!keyString) {
        throw new Error('Key is required when using hmac/keyed mode');
    }

    if (mode === 'hmac') {
        if (
            !(
                ['SHA-224', 'SHA-256', 'SHA-384', 'SHA-512'] as HmacCapable[]
            ).includes(algorithm as HmacCapable)
        ) {
            throw new Error(
                `HMAC is only supported for SHA-224, SHA-256, SHA-384, SHA-512 (got ${algorithm})`
            );
        }
        return { mode, key: keyString, keyEncoding };
    }

    if (mode === 'keyed') {
        if (algorithm !== 'BLAKE3') {
            throw new Error(
                `Keyed mode is only supported for BLAKE3 (got ${algorithm})`
            );
        }
        const decoded = decodeKey(keyString, keyEncoding);
        if (decoded.length !== 32) {
            throw new Error('BLAKE3 keyed mode requires a 32-byte key');
        }
        return { mode, key: keyString, keyEncoding };
    }

    throw new Error(`Unsupported mode: ${mode}`);
};

/**
 * Calculates the hash of a file.
 * @param filePath The path to the file.
 * @param algorithm The hash algorithm to use.
 * @param options Hash options: mode ('hash' | 'hmac' | 'keyed'), key, keyEncoding ('utf8' | 'hex' | 'base64').
 * @returns A promise that resolves with the hex-encoded hash string.
 */
export function fileHash(
    filePath: string,
    algorithm: THashAlgorithm = 'SHA-256',
    options?: HashOptions
): Promise<string> {
    const normalized = validateAndNormalizeOptions(algorithm, options);
    return FileHash?.fileHash(filePath, algorithm, normalized);
}

/**
 * Calculates the hash of a string. For large payloads prefer `fileHash` to avoid keeping all data in JS memory.
 * @param text The input string or base64-encoded data.
 * @param algorithm The hash algorithm to use.
 * @param encoding Input encoding: 'utf8' (default) or 'base64'.
 * @param options Hash options: mode ('hash' | 'hmac' | 'keyed'), key, keyEncoding ('utf8' | 'hex' | 'base64').
 * @returns A promise that resolves with the hex-encoded hash string.
 */
export function hashString(
    text: string,
    algorithm: THashAlgorithm = 'SHA-256',
    encoding: THashEncoding = 'utf8',
    options?: HashOptions
): Promise<string> {
    const normalized = validateAndNormalizeOptions(algorithm, options);
    return FileHash?.hashString(text, algorithm, encoding, normalized);
}

export type {
    THashAlgorithm,
    THashEncoding,
    THashMode,
    TKeyEncoding,
    HashOptions,
};
