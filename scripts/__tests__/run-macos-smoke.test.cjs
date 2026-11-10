const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const runner = path.resolve(__dirname, '../run-macos-smoke.sh');

function runFakeApp(t, source, timeout = 3) {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'macos-smoke-test-')
    );
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const app = path.join(directory, 'fake-app');
    fs.writeFileSync(app, `#!/usr/bin/env node\n${source}\n`, { mode: 0o755 });
    return spawnSync(
        'bash',
        [runner, app, path.join(directory, 'smoke.log'), String(timeout)],
        { encoding: 'utf8', timeout: 6000 }
    );
}

test('accepts a successful process that writes PASS immediately before exit', (t) => {
    const result = runFakeApp(
        t,
        "setTimeout(() => { console.log('FILE_HASH_MACOS_SMOKE_PASS'); process.exit(0); }, 50);"
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /FILE_HASH_MACOS_SMOKE_PASS/);
});

test('preserves a failure exit even after PASS', (t) => {
    const result = runFakeApp(
        t,
        "console.log('FILE_HASH_MACOS_SMOKE_PASS'); process.exit(7);"
    );
    assert.equal(result.status, 7, result.stderr);
});

test('rejects exit zero without PASS', (t) => {
    const result = runFakeApp(t, 'process.exit(0);');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /without PASS/);
});

test('times out a process hanging after PASS, even when it ignores SIGTERM', (t) => {
    const result = runFakeApp(
        t,
        "process.on('SIGTERM', () => {}); console.log('FILE_HASH_MACOS_SMOKE_PASS'); setInterval(() => {}, 1000);",
        1
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 124, result.stderr);
    assert.match(result.stderr, /timed out/);
});

test('times out a process that never writes PASS', (t) => {
    const result = runFakeApp(t, 'setInterval(() => {}, 1000);', 1);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 124, result.stderr);
});
