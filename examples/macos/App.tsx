import {
    fileHash,
    getRuntimeDiagnostics,
    getRuntimeInfo,
    stringHash,
    xxh3SeedFromLabel,
    type HashOptions,
    type RuntimeDiagnostics,
    type RuntimeInfo,
    type THashAlgorithm,
    type THashEncoding,
    type TKeyEncoding,
} from '@preeternal/react-native-file-hash';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Clipboard,
    NativeModules,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useColorScheme,
    View,
} from 'react-native';

type MacFilePickerModule = {
    pickFile(): Promise<{
        name: string;
        path: string;
        uri: string;
    } | null>;
};

type BenchmarkFileModule = {
    createFile(sizeBytes: number): Promise<string>;
    log?(message: string): void;
};

type BenchmarkAlgorithmResult = {
    algorithm: THashAlgorithm;
    samplesMs: number[];
    medianMs?: number;
    minMs?: number;
    maxMs?: number;
    digestPrefix?: string;
    error?: string;
};

type Xxh3SeedInputMode = 'label' | 'string' | 'number' | 'bigint';

const MacFilePicker = NativeModules.MacFilePicker as MacFilePickerModule;
const BenchmarkFile = NativeModules.BenchmarkFile as
    | BenchmarkFileModule
    | undefined;

const algorithms: THashAlgorithm[] = [
    'MD5',
    'SHA-1',
    'SHA-224',
    'SHA-256',
    'SHA-384',
    'SHA-512',
    'SHA-512/224',
    'SHA-512/256',
    'XXH3-64',
    'BLAKE3',
    'HMAC-SHA-224',
    'HMAC-SHA-256',
    'HMAC-SHA-384',
    'HMAC-SHA-512',
    'HMAC-MD5',
    'HMAC-SHA-1',
];

const benchmarkAlgorithms: THashAlgorithm[] = [
    'SHA-256',
    'MD5',
    'SHA-1',
    'SHA-224',
    'SHA-384',
    'SHA-512',
    'SHA-512/224',
    'SHA-512/256',
    'HMAC-SHA-224',
    'HMAC-SHA-256',
    'HMAC-SHA-384',
    'HMAC-SHA-512',
    'HMAC-MD5',
    'HMAC-SHA-1',
    'BLAKE3',
    'XXH3-64',
];

const textEncodings: THashEncoding[] = ['utf8', 'base64'];
const keyEncodings: TKeyEncoding[] = ['utf8', 'hex', 'base64'];
const seedModes: Xxh3SeedInputMode[] = ['label', 'string', 'number', 'bigint'];

function errorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
        return String((error as { message?: unknown }).message);
    }
    return String(error);
}

function isAbortError(error: unknown) {
    return (
        error !== null &&
        typeof error === 'object' &&
        ((error as { code?: unknown }).code === 'E_CANCELLED' ||
            (error as { name?: unknown }).name === 'AbortError')
    );
}

function normalizeManualPath(input: string) {
    const trimmed = input.trim();
    if (trimmed.length === 0 || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return `file://${trimmed}`;
}

function parseBoundedInt(
    value: string,
    fallback: number,
    min: number,
    max: number
) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

function median(values: number[]) {
    if (values.length === 0) {
        return undefined;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[middle] ?? 0;
    }

    const lower = sorted[middle - 1] ?? 0;
    const upper = sorted[middle] ?? lower;
    return (lower + upper) / 2;
}

function formatMs(value?: number | null) {
    if (value == null) {
        return 'n/a';
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
}

function buildBenchmarkKeyOptions(
    algorithm: THashAlgorithm
): HashOptions | undefined {
    if (!algorithm.startsWith('HMAC-')) {
        return undefined;
    }

    return {
        key: 'react-native-file-hash-benchmark-key',
        keyEncoding: 'utf8',
    };
}

function formatBenchmarkResult(result: BenchmarkAlgorithmResult) {
    if (result.error) {
        return `${result.algorithm}: ${result.error}`;
    }

    return `${result.algorithm}: ${formatMs(result.medianMs)} median (${formatMs(
        result.minMs
    )}-${formatMs(result.maxMs)}) ${result.digestPrefix ?? ''}`;
}

function App() {
    const isDark = useColorScheme() === 'dark';
    const palette = useMemo(
        () =>
            isDark
                ? {
                      bg: '#101216',
                      panel: '#181b21',
                      text: '#f4f6fb',
                      muted: '#98a2b3',
                      border: '#2b3039',
                      accent: '#4cc9a7',
                      accentSoft: '#193d35',
                      buttonText: '#06130f',
                  }
                : {
                      bg: '#f7f8fb',
                      panel: '#ffffff',
                      text: '#111827',
                      muted: '#5b6472',
                      border: '#d9dee7',
                      accent: '#0f9f7a',
                      accentSoft: '#e4f7f1',
                      buttonText: '#ffffff',
                  },
        [isDark]
    );
    const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
    const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(
        null
    );
    const [runtimeStatus, setRuntimeStatus] = useState('');
    const [selectedAlgo, setSelectedAlgo] = useState<THashAlgorithm>('SHA-256');
    const [textInput, setTextInput] = useState('hello macOS');
    const [textEncoding, setTextEncoding] = useState<THashEncoding>('utf8');
    const [textDigest, setTextDigest] = useState('');
    const [textElapsedMs, setTextElapsedMs] = useState<number | null>(null);
    const [textStatus, setTextStatus] = useState('');
    const [textLoading, setTextLoading] = useState(false);
    const [key, setKey] = useState('');
    const [keyEncoding, setKeyEncoding] = useState<TKeyEncoding>('utf8');
    const [seedMode, setSeedMode] = useState<Xxh3SeedInputMode>('label');
    const [seedLabel, setSeedLabel] = useState('media-cache-v1');
    const [seedInput, setSeedInput] = useState('0x091677a156a7756e');
    const [fileUri, setFileUri] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileDigest, setFileDigest] = useState('');
    const [fileElapsedMs, setFileElapsedMs] = useState<number | null>(null);
    const [fileStatus, setFileStatus] = useState('');
    const [fileLoading, setFileLoading] = useState(false);
    const [mmapEnabled, setMmapEnabled] = useState(false);
    const [benchmarkSizeMb, setBenchmarkSizeMb] = useState('200');
    const [benchmarkSamples, setBenchmarkSamples] = useState('3');
    const [benchmarkWarmups, setBenchmarkWarmups] = useState('1');
    const [benchmarkRunning, setBenchmarkRunning] = useState(false);
    const [benchmarkStatus, setBenchmarkStatus] = useState('');
    const [benchmarkCopyStatus, setBenchmarkCopyStatus] = useState('');
    const [benchmarkResults, setBenchmarkResults] = useState<
        BenchmarkAlgorithmResult[]
    >([]);
    const textAbortControllerRef = useRef<AbortController | null>(null);
    const fileAbortControllerRef = useRef<AbortController | null>(null);
    const benchmarkAbortControllerRef = useRef<AbortController | null>(null);
    const isHmacAlgorithm = selectedAlgo.startsWith('HMAC-');
    const isXxh3Algorithm =
        selectedAlgo === 'XXH3-64' || selectedAlgo === 'XXH3-128';
    const zigVersion =
        diagnostics?.engine === 'zig' ? diagnostics.zigVersion : 'n/a';
    const zigApi =
        diagnostics?.engine === 'zig'
            ? `${diagnostics.zigApiVersion}/${diagnostics.zigExpectedApiVersion}${
                  diagnostics.zigApiCompatible ? '' : ' mismatch'
              }`
            : 'n/a';
    const keyPlaceholder = isHmacAlgorithm
        ? 'HMAC key'
        : selectedAlgo === 'BLAKE3'
          ? '32-byte BLAKE3 key (optional)'
          : 'Only HMAC and BLAKE3 use keys';
    const seedInputValue = seedMode === 'label' ? seedLabel : seedInput;
    const seedPlaceholder =
        seedMode === 'label'
            ? 'media-cache-v1'
            : seedMode === 'number'
              ? '12345'
              : '0x091677a156a7756e';
    const benchmarkResultsText = useMemo(
        () => benchmarkResults.map(formatBenchmarkResult).join('\n'),
        [benchmarkResults]
    );

    useEffect(() => {
        let mounted = true;
        getRuntimeInfo()
            .then((value) => {
                if (mounted) {
                    setRuntimeInfo(value);
                }
            })
            .catch((error) => {
                if (mounted) {
                    setRuntimeStatus(errorMessage(error));
                }
            });
        getRuntimeDiagnostics()
            .then((value) => {
                if (mounted) {
                    setDiagnostics(value);
                }
            })
            .catch((error) => {
                if (mounted) {
                    setRuntimeStatus(errorMessage(error));
                }
            });

        return () => {
            mounted = false;
            textAbortControllerRef.current?.abort();
            fileAbortControllerRef.current?.abort();
            benchmarkAbortControllerRef.current?.abort();
        };
    }, []);

    const buildXxh3Seed = (): HashOptions['seed'] | undefined => {
        const rawValue =
            seedMode === 'label' ? seedLabel.trim() : seedInput.trim();

        if (rawValue.length === 0) {
            return undefined;
        }
        if (seedMode === 'label') {
            return xxh3SeedFromLabel(rawValue);
        }
        if (seedMode === 'number') {
            return Number(rawValue);
        }
        if (seedMode === 'bigint') {
            return BigInt(rawValue);
        }
        return rawValue;
    };

    const buildHashOptions = (): HashOptions | undefined => {
        if (isXxh3Algorithm) {
            const seed = buildXxh3Seed();
            return seed === undefined ? undefined : { seed };
        }

        if (!isHmacAlgorithm && key.length === 0) {
            return undefined;
        }

        return {
            key,
            keyEncoding,
        };
    };

    const hashText = async () => {
        const controller = new AbortController();
        textAbortControllerRef.current = controller;
        setTextLoading(true);
        setTextStatus('Hashing string...');
        setTextDigest('');
        setTextElapsedMs(null);

        try {
            const start = Date.now();
            const digest = await stringHash(textInput, {
                algorithm: selectedAlgo,
                encoding: textEncoding,
                hashOptions: buildHashOptions(),
                signal: controller.signal,
            });
            setTextDigest(digest);
            setTextElapsedMs(Date.now() - start);
            setTextStatus('');
        } catch (error) {
            if (isAbortError(error)) {
                setTextStatus('Cancelled');
            } else {
                setTextStatus(errorMessage(error));
            }
        } finally {
            if (textAbortControllerRef.current === controller) {
                textAbortControllerRef.current = null;
                setTextLoading(false);
            }
        }
    };

    const hashSelectedFile = async () => {
        const uri = normalizeManualPath(fileUri);
        if (!uri) {
            setFileStatus('Choose a file first');
            return;
        }

        const controller = new AbortController();
        fileAbortControllerRef.current = controller;
        setFileLoading(true);
        setFileStatus('Hashing file...');
        setFileDigest('');
        setFileElapsedMs(null);

        try {
            const start = Date.now();
            const digest = await fileHash(uri, {
                algorithm: selectedAlgo,
                hashOptions: buildHashOptions(),
                mmap: mmapEnabled,
                signal: controller.signal,
            });
            setFileDigest(digest);
            setFileElapsedMs(Date.now() - start);
            setFileStatus('');
        } catch (error) {
            if (isAbortError(error)) {
                setFileStatus('Cancelled');
            } else {
                setFileStatus(errorMessage(error));
            }
        } finally {
            if (fileAbortControllerRef.current === controller) {
                fileAbortControllerRef.current = null;
                setFileLoading(false);
            }
        }
    };

    const pickFile = async () => {
        setFileStatus('');
        try {
            const picked = await MacFilePicker.pickFile();
            if (!picked) {
                return;
            }
            setFileName(picked.name);
            setFileUri(picked.uri);
            setFileDigest('');
            setFileElapsedMs(null);
        } catch (error) {
            Alert.alert('File picker failed', errorMessage(error));
            setFileStatus(errorMessage(error));
        }
    };

    const cancelTextHash = () => {
        textAbortControllerRef.current?.abort();
    };

    const cancelFileHash = () => {
        fileAbortControllerRef.current?.abort();
    };

    const runBenchmark = async () => {
        if (!BenchmarkFile?.createFile) {
            Alert.alert(
                'Benchmark helper is unavailable',
                'Rebuild the macOS example app first.'
            );
            return;
        }

        const sizeMb = parseBoundedInt(benchmarkSizeMb, 200, 1, 4096);
        const samples = parseBoundedInt(benchmarkSamples, 3, 1, 20);
        const warmups = parseBoundedInt(benchmarkWarmups, 1, 0, 5);
        const sizeBytes = sizeMb * 1024 * 1024;
        const controller = new AbortController();
        const results: BenchmarkAlgorithmResult[] = [];

        benchmarkAbortControllerRef.current = controller;
        setBenchmarkRunning(true);
        setBenchmarkResults([]);
        setBenchmarkCopyStatus('');
        setBenchmarkStatus(`Preparing ${sizeMb} MiB file...`);

        try {
            const filePath = await BenchmarkFile.createFile(sizeBytes);
            if (controller.signal.aborted) {
                throw Object.assign(new Error('Benchmark cancelled'), {
                    name: 'AbortError',
                });
            }

            for (const algorithm of benchmarkAlgorithms) {
                setBenchmarkStatus(`Benchmarking ${algorithm}...`);

                try {
                    const totalRuns = warmups + samples;
                    const samplesMs: number[] = [];
                    let digestPrefix: string | undefined;

                    for (let run = 0; run < totalRuns; run += 1) {
                        if (controller.signal.aborted) {
                            throw Object.assign(
                                new Error('Benchmark cancelled'),
                                {
                                    name: 'AbortError',
                                }
                            );
                        }

                        const start = Date.now();
                        const digest = await fileHash(filePath, {
                            algorithm,
                            hashOptions: buildBenchmarkKeyOptions(algorithm),
                            mmap: mmapEnabled,
                            signal: controller.signal,
                        });
                        const elapsed = Date.now() - start;
                        digestPrefix = digest.slice(0, 16);

                        if (run >= warmups) {
                            samplesMs.push(elapsed);
                        }
                    }

                    const result: BenchmarkAlgorithmResult = {
                        algorithm,
                        samplesMs,
                        medianMs: median(samplesMs),
                        minMs: Math.min(...samplesMs),
                        maxMs: Math.max(...samplesMs),
                        digestPrefix,
                    };
                    results.push(result);
                    setBenchmarkResults([...results]);
                } catch (error) {
                    if (isAbortError(error) || controller.signal.aborted) {
                        throw error;
                    }

                    const result: BenchmarkAlgorithmResult = {
                        algorithm,
                        samplesMs: [],
                        error: errorMessage(error),
                    };
                    results.push(result);
                    setBenchmarkResults([...results]);
                }
            }

            const payload = {
                version: 1,
                platform: Platform.OS,
                engine: runtimeInfo?.engine ?? diagnostics?.engine ?? 'unknown',
                sizeBytes,
                sizeMiB: sizeMb,
                samples,
                warmups,
                mmap: mmapEnabled,
                algorithms: benchmarkAlgorithms,
                results,
                createdAt: new Date().toISOString(),
            };
            const line = `ZFH_BENCHMARK_RESULT ${JSON.stringify(payload)}`;
            console.log(line);
            BenchmarkFile.log?.(line);
            setBenchmarkStatus('Benchmark complete');
        } catch (error) {
            if (isAbortError(error) || controller.signal.aborted) {
                setBenchmarkStatus('Benchmark cancelled');
                BenchmarkFile.log?.('ZFH_BENCHMARK_CANCELLED');
                return;
            }

            console.warn('Benchmark failed', error);
            BenchmarkFile.log?.(`ZFH_BENCHMARK_FAILED ${errorMessage(error)}`);
            setBenchmarkStatus('Benchmark failed');
            Alert.alert('Benchmark failed', errorMessage(error));
        } finally {
            if (benchmarkAbortControllerRef.current === controller) {
                benchmarkAbortControllerRef.current = null;
                setBenchmarkRunning(false);
            }
        }
    };

    const cancelBenchmark = () => {
        const controller = benchmarkAbortControllerRef.current;
        if (!controller || controller.signal.aborted) {
            return;
        }

        setBenchmarkStatus('Cancelling benchmark...');
        controller.abort();
    };

    const copyBenchmarkResults = async () => {
        if (benchmarkResultsText.length === 0) {
            return;
        }

        try {
            Clipboard.setString(benchmarkResultsText);
            setBenchmarkCopyStatus('Copied');
        } catch (error) {
            const message = errorMessage(error);
            setBenchmarkCopyStatus(message);
            Alert.alert('Copy failed', message);
        }
    };

    const renderChoice = <T extends string>(
        value: T,
        selected: boolean,
        onPress: (value: T) => void
    ) => (
        <Pressable
            key={value}
            onPress={() => onPress(value)}
            style={[
                styles.chip,
                {
                    borderColor: selected ? palette.accent : palette.border,
                    backgroundColor: selected ? palette.accentSoft : palette.bg,
                },
            ]}
        >
            <Text
                style={[
                    styles.chipText,
                    { color: selected ? palette.accent : palette.text },
                ]}
            >
                {value}
            </Text>
        </Pressable>
    );

    return (
        <ScrollView
            style={[styles.root, { backgroundColor: palette.bg }]}
            contentContainerStyle={styles.content}
        >
            <View
                style={[
                    styles.panel,
                    {
                        backgroundColor: palette.panel,
                        borderColor: palette.border,
                    },
                ]}
            >
                <Text style={[styles.title, { color: palette.text }]}>
                    File Hash macOS
                </Text>
                <Text style={[styles.meta, { color: palette.muted }]}>
                    engine:{' '}
                    {runtimeInfo?.engine ?? diagnostics?.engine ?? 'loading'} |
                    zig: {zigVersion} | abi: {zigApi}
                </Text>
                {runtimeStatus.length > 0 ? (
                    <Text style={[styles.status, { color: palette.muted }]}>
                        {runtimeStatus}
                    </Text>
                ) : null}
            </View>

            <View
                style={[
                    styles.panel,
                    {
                        backgroundColor: palette.panel,
                        borderColor: palette.border,
                    },
                ]}
            >
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                    Benchmark
                </Text>
                <View style={styles.benchmarkGrid}>
                    <View style={styles.benchmarkField}>
                        <Text style={[styles.label, { color: palette.muted }]}>
                            Size MiB
                        </Text>
                        <TextInput
                            value={benchmarkSizeMb}
                            onChangeText={setBenchmarkSizeMb}
                            keyboardType="number-pad"
                            selectTextOnFocus
                            style={[
                                styles.input,
                                styles.benchmarkInput,
                                {
                                    borderColor: palette.border,
                                    color: palette.text,
                                    backgroundColor: palette.bg,
                                },
                            ]}
                        />
                    </View>
                    <View style={styles.benchmarkField}>
                        <Text style={[styles.label, { color: palette.muted }]}>
                            Samples
                        </Text>
                        <TextInput
                            value={benchmarkSamples}
                            onChangeText={setBenchmarkSamples}
                            keyboardType="number-pad"
                            selectTextOnFocus
                            style={[
                                styles.input,
                                styles.benchmarkInput,
                                {
                                    borderColor: palette.border,
                                    color: palette.text,
                                    backgroundColor: palette.bg,
                                },
                            ]}
                        />
                    </View>
                    <View style={styles.benchmarkField}>
                        <Text style={[styles.label, { color: palette.muted }]}>
                            Warmups
                        </Text>
                        <TextInput
                            value={benchmarkWarmups}
                            onChangeText={setBenchmarkWarmups}
                            keyboardType="number-pad"
                            selectTextOnFocus
                            style={[
                                styles.input,
                                styles.benchmarkInput,
                                {
                                    borderColor: palette.border,
                                    color: palette.text,
                                    backgroundColor: palette.bg,
                                },
                            ]}
                        />
                    </View>
                </View>
                <View style={styles.row}>
                    <Pressable
                        disabled={benchmarkRunning}
                        style={[
                            styles.button,
                            {
                                backgroundColor: palette.accent,
                            },
                            benchmarkRunning ? styles.disabledButton : null,
                        ]}
                        onPress={runBenchmark}
                    >
                        {benchmarkRunning ? (
                            <ActivityIndicator color={palette.buttonText} />
                        ) : (
                            <Text
                                style={[
                                    styles.buttonText,
                                    { color: palette.buttonText },
                                ]}
                            >
                                Run Benchmark
                            </Text>
                        )}
                    </Pressable>
                    {benchmarkRunning ? (
                        <Pressable
                            style={[
                                styles.secondaryButton,
                                { borderColor: palette.accent },
                            ]}
                            onPress={cancelBenchmark}
                        >
                            <Text
                                style={[
                                    styles.secondaryButtonText,
                                    { color: palette.accent },
                                ]}
                            >
                                Cancel
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
                {benchmarkStatus.length > 0 ? (
                    <Text style={[styles.status, { color: palette.muted }]}>
                        {benchmarkStatus}
                    </Text>
                ) : null}
                {benchmarkResults.length > 0 ? (
                    <>
                        <View
                            style={[
                                styles.resultBox,
                                {
                                    borderColor: palette.border,
                                    backgroundColor: palette.bg,
                                },
                            ]}
                        >
                            {benchmarkStatus === 'Benchmark complete' ? (
                                <View style={styles.resultBoxActions}>
                                    {benchmarkCopyStatus.length > 0 ? (
                                        <Text
                                            numberOfLines={1}
                                            style={[
                                                styles.copyStatus,
                                                { color: palette.muted },
                                            ]}
                                        >
                                            {benchmarkCopyStatus}
                                        </Text>
                                    ) : null}
                                    <Pressable
                                        accessibilityLabel="Copy benchmark results"
                                        accessibilityRole="button"
                                        hitSlop={8}
                                        style={[
                                            styles.copyIconButton,
                                            {
                                                borderColor: palette.border,
                                                backgroundColor: palette.panel,
                                            },
                                        ]}
                                        onPress={copyBenchmarkResults}
                                    >
                                        <View style={styles.copyIcon}>
                                            <View
                                                style={[
                                                    styles.copyIconBack,
                                                    {
                                                        borderColor:
                                                            palette.muted,
                                                    },
                                                ]}
                                            />
                                            <View
                                                style={[
                                                    styles.copyIconFront,
                                                    {
                                                        borderColor:
                                                            palette.muted,
                                                        backgroundColor:
                                                            palette.panel,
                                                    },
                                                ]}
                                            />
                                        </View>
                                    </Pressable>
                                </View>
                            ) : null}
                            <Text
                                selectable
                                style={[
                                    styles.resultText,
                                    { color: palette.text },
                                ]}
                            >
                                {benchmarkResultsText}
                            </Text>
                        </View>
                    </>
                ) : null}
            </View>

            <View
                style={[
                    styles.panel,
                    {
                        backgroundColor: palette.panel,
                        borderColor: palette.border,
                    },
                ]}
            >
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                    Algorithm
                </Text>
                <View style={styles.wrap}>
                    {algorithms.map((algorithm) =>
                        renderChoice(
                            algorithm,
                            selectedAlgo === algorithm,
                            setSelectedAlgo
                        )
                    )}
                </View>

                <Text style={[styles.label, { color: palette.muted }]}>
                    Key
                </Text>
                <TextInput
                    value={key}
                    onChangeText={setKey}
                    placeholder={keyPlaceholder}
                    placeholderTextColor={palette.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                        styles.input,
                        {
                            borderColor: palette.border,
                            color: palette.text,
                            backgroundColor: palette.bg,
                        },
                    ]}
                />
                <View style={styles.wrap}>
                    {keyEncodings.map((encoding) =>
                        renderChoice(
                            encoding,
                            keyEncoding === encoding,
                            setKeyEncoding
                        )
                    )}
                </View>

                {isXxh3Algorithm ? (
                    <>
                        <Text style={[styles.label, { color: palette.muted }]}>
                            XXH3 seed
                        </Text>
                        <View style={styles.wrap}>
                            {seedModes.map((mode) =>
                                renderChoice(
                                    mode,
                                    seedMode === mode,
                                    setSeedMode
                                )
                            )}
                        </View>
                        <TextInput
                            value={seedInputValue}
                            onChangeText={
                                seedMode === 'label'
                                    ? setSeedLabel
                                    : setSeedInput
                            }
                            placeholder={seedPlaceholder}
                            placeholderTextColor={palette.muted}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={[
                                styles.input,
                                {
                                    borderColor: palette.border,
                                    color: palette.text,
                                    backgroundColor: palette.bg,
                                },
                            ]}
                        />
                    </>
                ) : null}
                <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: mmapEnabled }}
                    style={styles.checkboxRow}
                    onPress={() => setMmapEnabled((value) => !value)}
                >
                    <View
                        style={[
                            styles.checkboxBox,
                            {
                                borderColor: mmapEnabled
                                    ? palette.accent
                                    : palette.border,
                            },
                        ]}
                    >
                        {mmapEnabled ? (
                            <View
                                style={[
                                    styles.checkboxCheck,
                                    { borderColor: palette.accent },
                                ]}
                            />
                        ) : null}
                    </View>
                    <Text
                        style={[styles.checkboxLabel, { color: palette.text }]}
                    >
                        mmap
                    </Text>
                </Pressable>
            </View>

            <View
                style={[
                    styles.panel,
                    {
                        backgroundColor: palette.panel,
                        borderColor: palette.border,
                    },
                ]}
            >
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                    String
                </Text>
                <View style={styles.wrap}>
                    {textEncodings.map((encoding) =>
                        renderChoice(
                            encoding,
                            textEncoding === encoding,
                            setTextEncoding
                        )
                    )}
                </View>
                <TextInput
                    value={textInput}
                    onChangeText={setTextInput}
                    multiline
                    style={[
                        styles.input,
                        styles.multiline,
                        {
                            borderColor: palette.border,
                            color: palette.text,
                            backgroundColor: palette.bg,
                        },
                    ]}
                />
                <View style={styles.row}>
                    <Pressable
                        style={[
                            styles.button,
                            { backgroundColor: palette.accent },
                        ]}
                        onPress={hashText}
                    >
                        <Text
                            style={[
                                styles.buttonText,
                                { color: palette.buttonText },
                            ]}
                        >
                            Hash String
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[
                            styles.secondaryButton,
                            { borderColor: palette.accent },
                        ]}
                        onPress={cancelTextHash}
                    >
                        <Text
                            style={[
                                styles.secondaryButtonText,
                                { color: palette.accent },
                            ]}
                        >
                            Cancel
                        </Text>
                    </Pressable>
                </View>
                <Text style={[styles.meta, { color: palette.muted }]}>
                    {textLoading ? 'running' : formatMs(textElapsedMs)}
                </Text>
                <Text
                    selectable
                    style={[styles.digest, { color: palette.text }]}
                >
                    {textDigest || ' '}
                </Text>
                {textStatus.length > 0 ? (
                    <Text style={[styles.status, { color: palette.muted }]}>
                        {textStatus}
                    </Text>
                ) : null}
            </View>

            <View
                style={[
                    styles.panel,
                    {
                        backgroundColor: palette.panel,
                        borderColor: palette.border,
                    },
                ]}
            >
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                    File
                </Text>
                <View style={styles.row}>
                    <Pressable
                        style={[
                            styles.button,
                            { backgroundColor: palette.accent },
                        ]}
                        onPress={pickFile}
                    >
                        <Text
                            style={[
                                styles.buttonText,
                                { color: palette.buttonText },
                            ]}
                        >
                            Open File
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[
                            styles.button,
                            { backgroundColor: palette.accent },
                        ]}
                        onPress={hashSelectedFile}
                    >
                        <Text
                            style={[
                                styles.buttonText,
                                { color: palette.buttonText },
                            ]}
                        >
                            Hash File
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[
                            styles.secondaryButton,
                            { borderColor: palette.accent },
                        ]}
                        onPress={cancelFileHash}
                    >
                        <Text
                            style={[
                                styles.secondaryButtonText,
                                { color: palette.accent },
                            ]}
                        >
                            Cancel
                        </Text>
                    </Pressable>
                </View>
                <TextInput
                    value={fileUri}
                    onChangeText={(value) => {
                        setFileUri(value);
                        setFileName('');
                    }}
                    placeholder="file:///Users/me/file.bin or content://..."
                    placeholderTextColor={palette.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                        styles.input,
                        {
                            borderColor: palette.border,
                            color: palette.text,
                            backgroundColor: palette.bg,
                        },
                    ]}
                />
                <Text style={[styles.meta, { color: palette.muted }]}>
                    {fileName || fileUri || ' '}
                </Text>
                <Text style={[styles.meta, { color: palette.muted }]}>
                    {fileLoading ? 'running' : formatMs(fileElapsedMs)}
                </Text>
                <Text
                    selectable
                    style={[styles.digest, { color: palette.text }]}
                >
                    {fileDigest || ' '}
                </Text>
                {fileStatus.length > 0 ? (
                    <Text style={[styles.status, { color: palette.muted }]}>
                        {fileStatus}
                    </Text>
                ) : null}
            </View>

            {textLoading || fileLoading || benchmarkRunning ? (
                <ActivityIndicator color={palette.accent} />
            ) : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    content: {
        padding: 24,
        gap: 16,
    },
    panel: {
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 16,
        gap: 12,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    meta: {
        fontSize: 13,
    },
    status: {
        fontSize: 13,
    },
    input: {
        borderRadius: 6,
        borderWidth: 1,
        fontSize: 15,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    benchmarkGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    benchmarkField: {
        minWidth: 120,
        flexGrow: 1,
        gap: 6,
    },
    benchmarkInput: {
        minWidth: 120,
    },
    multiline: {
        minHeight: 92,
        textAlignVertical: 'top',
    },
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    wrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        borderRadius: 6,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '700',
    },
    checkboxRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 10,
    },
    checkboxBox: {
        alignItems: 'center',
        borderRadius: 4,
        borderWidth: 1.5,
        height: 20,
        justifyContent: 'center',
        width: 20,
    },
    checkboxCheck: {
        borderBottomWidth: 2,
        borderRightWidth: 2,
        height: 10,
        marginTop: -2,
        transform: [{ rotate: '45deg' }],
        width: 5,
    },
    checkboxLabel: {
        fontSize: 14,
        fontWeight: '700',
    },
    button: {
        alignItems: 'center',
        borderRadius: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    disabledButton: {
        opacity: 0.65,
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '700',
    },
    secondaryButton: {
        alignItems: 'center',
        borderRadius: 6,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    secondaryButtonText: {
        fontSize: 15,
        fontWeight: '700',
    },
    digest: {
        fontFamily: 'Menlo',
        fontSize: 12,
        lineHeight: 18,
    },
    resultBox: {
        borderRadius: 6,
        borderWidth: 1,
        padding: 12,
        position: 'relative',
        gap: 6,
    },
    resultBoxActions: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
        position: 'absolute',
        right: 10,
        top: 10,
        zIndex: 1,
    },
    copyStatus: {
        fontSize: 12,
        maxWidth: 120,
    },
    copyIconButton: {
        alignItems: 'center',
        borderRadius: 6,
        borderWidth: 1,
        height: 32,
        justifyContent: 'center',
        width: 32,
    },
    copyIcon: {
        height: 18,
        position: 'relative',
        width: 18,
    },
    copyIconBack: {
        borderRadius: 3,
        borderWidth: 1.5,
        height: 11,
        left: 2,
        position: 'absolute',
        top: 2,
        width: 11,
    },
    copyIconFront: {
        borderRadius: 3,
        borderWidth: 1.5,
        height: 11,
        left: 6,
        position: 'absolute',
        top: 6,
        width: 11,
    },
    resultText: {
        fontFamily: 'Menlo',
        fontSize: 12,
        lineHeight: 18,
    },
});

export default App;
