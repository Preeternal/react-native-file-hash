import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getFileSha256(filePath: string): Promise<string>;
  md5Hash(filePath: string): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('FileHash');