jest.mock('./NativeFileHash', () => ({
    __esModule: true,
    default: {
        fileHash: jest.fn(async () => '616263'),
        stringHash: jest.fn(async () => '616263'),
        getRuntimeInfo: jest.fn(async () => ({
            engine: 'zig',
        })),
        getRuntimeDiagnostics: jest.fn(async () => ({
            engine: 'zig',
            zigApiVersion: 2,
            zigExpectedApiVersion: 2,
            zigApiCompatible: true,
            zigVersion: 'v0.0.3',
        })),
    },
}));
