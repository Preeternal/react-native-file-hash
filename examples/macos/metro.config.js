const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const root = path.resolve(__dirname, '../..');

const config = withMetroConfig(getDefaultConfig(__dirname), {
    root,
    dirname: __dirname,
});

config.resolver = {
    ...config.resolver,
    disableHierarchicalLookup: true,
    nodeModulesPaths: [path.join(__dirname, 'node_modules')],
    extraNodeModules: {
        ...config.resolver?.extraNodeModules,
        'react': path.join(__dirname, 'node_modules/react'),
        'react-native': path.join(__dirname, 'node_modules/react-native'),
    },
};

module.exports = config;
