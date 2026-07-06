const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

const root = path.resolve(__dirname, '../..');
const packageName = require('../../package.json').name;
const rnwPath = path.resolve(
    require.resolve('react-native-windows/package.json'),
    '..'
);

const config = withMetroConfig(getDefaultConfig(__dirname), {
    root,
    dirname: __dirname,
});

const baseBlockList = Array.isArray(config.resolver?.blockList)
    ? config.resolver.blockList
    : config.resolver?.blockList
      ? [config.resolver.blockList]
      : [];

config.resolver = {
    ...config.resolver,
    disableHierarchicalLookup: true,
    nodeModulesPaths: [path.join(__dirname, 'node_modules')],
    extraNodeModules: {
        ...config.resolver?.extraNodeModules,
        [packageName]: root,
        'react': path.join(__dirname, 'node_modules/react'),
        'react-native': path.join(__dirname, 'node_modules/react-native'),
    },
    blockList: [
        ...baseBlockList,
        new RegExp(
            `${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`
        ),
        new RegExp(`${rnwPath.replace(/[/\\]/g, '/')}/build/.*`),
        new RegExp(`${rnwPath.replace(/[/\\]/g, '/')}/target/.*`),
        /.*\.ProjectImports\.zip/,
    ],
};

module.exports = config;
