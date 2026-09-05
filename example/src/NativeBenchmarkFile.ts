import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
    createFile(sizeBytes: number): Promise<string>;
    log(message: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('BenchmarkFile');
