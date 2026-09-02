import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
    pickFile(): Promise<{ name: string; path: string; uri: string } | null>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MacFilePicker');
