import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type THashAlgorithm =
  | 'MD5'
  | 'SHA-1'
  | 'SHA-224'
  | 'SHA-256'
  | 'SHA-384'
  | 'SHA-512';
export interface Spec extends TurboModule {
    fileHash(filePath: string, algorithm: THashAlgorithm): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('FileHash');
