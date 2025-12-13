import { TurboModuleRegistry, type TurboModule } from 'react-native';

export type THashAlgorithm =
    | 'MD5'
    | 'SHA-1'
    | 'SHA-224'
    | 'SHA-256'
    | 'SHA-384'
    | 'SHA-512'
    | 'XXH3-64'
    | 'XXH3-128'
    | 'BLAKE3';
export type THashEncoding = 'utf8' | 'base64';
export type THashMode = 'hash' | 'hmac' | 'keyed';
export type TKeyEncoding = 'utf8' | 'hex' | 'base64';
export type HashOptions = {
    mode?: THashMode;
    key?: string;
    keyEncoding?: TKeyEncoding;
};
export interface Spec extends TurboModule {
    fileHash(
        filePath: string,
        algorithm: THashAlgorithm,
        options?: HashOptions
    ): Promise<string>;
    hashString(
        text: string,
        algorithm: THashAlgorithm,
        encoding?: THashEncoding,
        options?: HashOptions
    ): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('FileHash');
