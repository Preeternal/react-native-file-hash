const {
    createRunOncePlugin,
    withAndroidGradleProperties,
    withPodfile,
} = require('@expo/config-plugins');

const pkg = require('./package.json');

const PLUGIN_NAME = pkg.name;
const VALID_ENGINES = new Set(['native', 'zig']);
const PODFILE_BLOCK_START = '# @preeternal/react-native-file-hash begin';
const PODFILE_BLOCK_END = '# @preeternal/react-native-file-hash end';

function normalizeEngine(rawEngine) {
    const engine = (rawEngine ?? 'native').toString().toLowerCase();
    if (!VALID_ENGINES.has(engine)) {
        throw new Error(
            `${PLUGIN_NAME}: invalid engine '${rawEngine}'. Expected 'native' or 'zig'.`
        );
    }
    return engine;
}

function setAndroidEngine(config, engine) {
    return withAndroidGradleProperties(config, (mod) => {
        const key = 'react_native_file_hash_engine';
        const existing = mod.modResults.find(
            (item) => item.type === 'property' && item.key === key
        );

        if (existing) {
            existing.value = engine;
        } else {
            mod.modResults.push({
                type: 'property',
                key,
                value: engine,
            });
        }

        return mod;
    });
}

function updatePodfileContents(contents, engine) {
    const managedBlock =
        `${PODFILE_BLOCK_START}\n` +
        `ENV['ZFH_ENGINE'] ||= '${engine}'\n` +
        `${PODFILE_BLOCK_END}`;

    const escapedStart = PODFILE_BLOCK_START.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
    );
    const escapedEnd = PODFILE_BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const managedBlockRegex = new RegExp(
        `${escapedStart}[\\s\\S]*?${escapedEnd}`,
        'm'
    );

    if (managedBlockRegex.test(contents)) {
        return contents.replace(managedBlockRegex, managedBlock);
    }

    const existingEnvRegex =
        /ENV\[['"]ZFH_ENGINE['"]\]\s*(?:\|\|)?=\s*['"][^'"]*['"]/;
    if (existingEnvRegex.test(contents)) {
        return contents.replace(
            existingEnvRegex,
            `ENV['ZFH_ENGINE'] ||= '${engine}'`
        );
    }

    const firstNonCommentLineRegex = /^((?:\s*#.*\n)*)/;
    const match = contents.match(firstNonCommentLineRegex);
    const insertAt = match ? match[0].length : 0;
    return (
        contents.slice(0, insertAt) +
        `${managedBlock}\n\n` +
        contents.slice(insertAt)
    );
}

function setIosEngine(config, engine) {
    return withPodfile(config, (mod) => {
        mod.modResults.contents = updatePodfileContents(
            mod.modResults.contents,
            engine
        );
        return mod;
    });
}

function withFileHashEngine(config, props = {}) {
    const engine = normalizeEngine(props.engine);
    config = setAndroidEngine(config, engine);
    config = setIosEngine(config, engine);
    return config;
}

module.exports = createRunOncePlugin(withFileHashEngine, pkg.name, pkg.version);
