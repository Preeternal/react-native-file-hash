module.exports = {
    dependency: {
        platforms: {
            windows: {
                sourceDir: 'windows',
                solutionFile: 'FileHash.sln',
                projects: [
                    {
                        projectFile: 'FileHash\\FileHash.vcxproj',
                        directDependency: true,
                    },
                ],
            },
        },
    },
    spm: {
        autolinkingPlugin: './scripts/spm-autolinking-plugin.js',
    },
};
