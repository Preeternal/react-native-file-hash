import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
    `The package '@preeternal/react-native-file-hash' doesn't seem to be linked. Make sure: \n\n` +
    Platform.select({
        ios: "- You have run 'bundle exec pod install'\n",
        default: '',
    }) +
    '- You rebuilt the app after installing the package\n' +
    '- You are not using Expo Go\n';

// @ts-expect-error
const isTurboModuleEnabled = global.__turboModuleProxy != null;

const FileHashModule = isTurboModuleEnabled
    ? require('./FileHashSpec').default
    : NativeModules.FileHash;

const FileHash = FileHashModule
    ? FileHashModule
    : new Proxy(
          {},
          {
              get() {
                  throw new Error(LINKING_ERROR);
              },
          },
      );

export function getFileSha256(filePath: string): Promise<string> {
    return FileHash.getFileSha256(filePath);
}

export function md5Hash(filePath: string): Promise<string> {
    return FileHash.md5Hash(filePath);
}
