/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@preeternal/react-native-file-hash', () => ({
    fileHash: jest.fn().mockResolvedValue('hash'),
    getRuntimeDiagnostics: jest.fn().mockResolvedValue({ engine: 'native' }),
    getRuntimeInfo: jest.fn().mockResolvedValue({ engine: 'native' }),
    stringHash: jest.fn().mockResolvedValue('hash'),
    xxh3SeedFromLabel: jest.fn().mockReturnValue('0x0'),
}));

jest.mock('../specs/NativeBenchmarkFile', () => ({
    __esModule: true,
    default: {
        createFile: jest.fn(),
        log: jest.fn(),
    },
}));

jest.mock('../specs/NativeMacFilePicker', () => ({
    __esModule: true,
    default: {
        pickFile: jest.fn(),
    },
}));

import App from '../App';

test('renders correctly', async () => {
    await ReactTestRenderer.act(() => {
        ReactTestRenderer.create(<App />);
    });
});
