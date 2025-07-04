import type { TurboModule } from 'react-native';
export interface Spec extends TurboModule {
    getFileSha256(filePath: string): Promise<string>;
    md5Hash(filePath: string): Promise<string>;
}
declare const _default: Spec | null;
export default _default;
