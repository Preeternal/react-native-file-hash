import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type THashAlgorithm = 'MD5' | 'SHA-256';
export interface Spec extends TurboModule {
    fileHash(filePath: string, algorithm: THashAlgorithm): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('FileHash');
