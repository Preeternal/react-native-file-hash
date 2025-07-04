"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileSha256 = getFileSha256;
exports.md5Hash = md5Hash;
const react_native_1 = require("react-native");
const LINKING_ERROR = `The package '@preeternal/react-native-file-hash' doesn't seem to be linked. Make sure: \n\n` +
    react_native_1.Platform.select({ ios: "- You have run 'bundle exec pod install'\n", default: '' }) +
    '- You rebuilt the app after installing the package\n' +
    '- You are not using Expo Go\n';
// Для новой архитектуры (TurboModule)
const FileHash = react_native_1.NativeModules.FileHash
    ? react_native_1.NativeModules.FileHash
    : new Proxy({}, {
        get() {
            throw new Error(LINKING_ERROR);
        },
    });
function getFileSha256(filePath) {
    return FileHash.getFileSha256(filePath);
}
function md5Hash(filePath) {
    return FileHash.md5Hash(filePath);
}
