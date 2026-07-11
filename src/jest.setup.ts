import { jest } from '@jest/globals';

jest.mock('./NativeFileHash', () => ({
    __esModule: true,
    default: {
        fileHash: jest.fn(async () => '616263'),
        stringHash: jest.fn(async () => '616263'),
        cancelOperation: jest.fn(),
        getRuntimeInfo: jest.fn(async () => ({
            engine: 'zig',
        })),
        getRuntimeDiagnostics: jest.fn(async () => ({
            engine: 'zig',
            zigApiVersion: 4,
            zigExpectedApiVersion: 4,
            zigApiCompatible: true,
            zigVersion: 'v0.0.7',
        })),
    },
}));
