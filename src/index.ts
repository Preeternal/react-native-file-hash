import { NativeModules, Platform } from 'react-native';
import FileHashSpec, { type Spec } from './FileHashSpec';

const LINKING_ERROR =
    `The package '@preeternal/react-native-file-hash' doesn't seem to be linked. Make sure: \n\n` +
    Platform.select({
        ios: "- You have run 'bundle exec pod install'\n",
        default: '',
    }) +
    '- You rebuilt the app after installing the package\n' +
    '- You are not using Expo Go\n';

const FileHash = (FileHashSpec ??
    NativeModules.FileHash ??
    new Proxy(
        {},
        {
            get() {
                throw new Error(LINKING_ERROR);
            },
        },
    )) as Spec;

export function getFileSha256(filePath: string): Promise<string> {
    return FileHash.getFileSha256(filePath);
}

export function md5Hash(filePath: string): Promise<string> {
    return FileHash.md5Hash(filePath);
}
