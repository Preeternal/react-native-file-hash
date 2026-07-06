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
};
