import FileHash, { THashAlgorithm } from './NativeFileHash';

/**
 * Calculates the hash of a file.
 * @param filePath The path to the file.
 * @param algorithm The hash algorithm to use.
 * @returns A promise that resolves with the hex-encoded hash string.
 */
export function fileHash(
    filePath: string,
    algorithm: THashAlgorithm = 'SHA-256',
): Promise<string> {
    return FileHash?.fileHash(filePath, algorithm);
}

export type { THashAlgorithm };
