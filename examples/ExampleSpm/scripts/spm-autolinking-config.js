const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const cliPath = require.resolve('@react-native-community/cli/build/bin.js', {
  paths: [projectRoot],
});

const result = spawnSync(process.execPath, [cliPath, 'config'], {
  cwd: projectRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || 'react-native config failed\n');
  process.exit(result.status || 1);
}

const config = JSON.parse(result.stdout);

// CLI 20 discovers iOS projects through a Podfile. After `spm:setup` removes
// CocoaPods, keep the project discoverable without bringing Pods back.
config.project = config.project || {};
config.project.ios = {
  sourceDir: path.join(projectRoot, 'ios'),
  xcodeProject: {
    name: 'ExampleSpm.xcodeproj',
    path: '.',
    isWorkspace: false,
  },
  automaticPodsInstallation: false,
  assets: [],
};

process.stdout.write(JSON.stringify(config));
