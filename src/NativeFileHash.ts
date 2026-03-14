import { TurboModuleRegistry, type TurboModule } from 'react-native';

export type THashAlgorithm =
    | 'MD5'
    | 'SHA-1'
    | 'SHA-224'
    | 'SHA-256'
    | 'SHA-384'
    | 'SHA-512'
    | 'SHA-512/224'
    | 'SHA-512/256'
    | 'XXH3-64'
    | 'XXH3-128'
    | 'BLAKE3'
    | 'HMAC-SHA-224'
    | 'HMAC-SHA-256'
    | 'HMAC-SHA-384'
    | 'HMAC-SHA-512'
    | 'HMAC-MD5'
    | 'HMAC-SHA-1';
export type THashEncoding = 'utf8' | 'base64';
export type TKeyEncoding = 'utf8' | 'hex' | 'base64';
export type HashOptions = {
    key?: string;
    keyEncoding?: TKeyEncoding;
};
export type RuntimeInfo = {
    engine: 'native' | 'zig';
};
export type RuntimeDiagnostics = RuntimeInfo & {
    zigApiVersion: number;
    zigExpectedApiVersion: number;
    zigApiCompatible: boolean;
    zigVersion: string;
};
export interface Spec extends TurboModule {
    fileHash(
        filePath: string,
        algorithm: THashAlgorithm,
        options?: HashOptions
    ): Promise<string>;
    stringHash(
        text: string,
        algorithm: THashAlgorithm,
        encoding?: THashEncoding,
        options?: HashOptions
    ): Promise<string>;
    getRuntimeInfo(): Promise<RuntimeInfo>;
    getRuntimeDiagnostics(): Promise<RuntimeDiagnostics>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('FileHash');
