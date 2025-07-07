import { NativeModules, Platform } from 'react-native';
import { Spec, THashAlgorithm } from './FileHashSpec';

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

/**
 * Calculates the hash of a file.
 * @param filePath The path to the file.
 * @param algorithm The hash algorithm to use.
 * @returns A promise that resolves with the hex-encoded hash string.
 */
export function fileHash(
    filePath: string,
    algorithm: THashAlgorithm = 'SHA-256',
): Promise<string> {
    return (FileHash as Spec).fileHash(filePath, algorithm);
}

export type { THashAlgorithm };
