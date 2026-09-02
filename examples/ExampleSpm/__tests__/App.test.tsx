/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@preeternal/react-native-file-hash', () => ({
  fileHash: jest.fn(),
  getRuntimeDiagnostics: jest.fn(async () => ({ engine: 'native' })),
  getRuntimeInfo: jest.fn(async () => ({ engine: 'native' })),
  stringHash: jest.fn(),
  xxh3SeedFromLabel: jest.fn(() => 0n),
}));

jest.mock('@react-native-documents/picker', () => ({
  keepLocalCopy: jest.fn(),
  pick: jest.fn(),
  types: { allFiles: '*/*' },
}));

jest.mock('../src/NativeBenchmarkFile', () => ({
  default: {
    createFile: jest.fn(),
    log: jest.fn(),
  },
}));

import App from '../src/App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });
});
