/* eslint-disable react-native/no-inline-styles */
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { keepLocalCopy, pick, types } from '@react-native-documents/picker';
import {
    SafeAreaProvider,
    SafeAreaView,
    useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    NativeModules,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    useColorScheme,
    View,
} from 'react-native';

type PickedFile = {
    name: string;
    uri: string;
    displayUri: string;
    size?: number | null;
};

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
    'XXH3-128',
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

const BenchmarkFile = NativeModules.BenchmarkFile as
    | BenchmarkFileModule
    | undefined;

const xxh3SeedInputModes: Xxh3SeedInputMode[] = [
    'label',
    'string',
    'number',
    'bigint',
];

const formatBytes = (size?: number | null) => {
    if (!size || size <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(
        Math.floor(Math.log(size) / Math.log(1024)),
        units.length - 1
    );
    const value = size / 1024 ** i;
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
};

const isAbortError = (error: unknown) =>
    error !== null &&
    typeof error === 'object' &&
    ((error as { code?: unknown }).code === 'E_CANCELLED' ||
        (error as { name?: unknown }).name === 'AbortError');

const nowMs = () => Date.now();

const parseBoundedInt = (
    value: string,
    fallback: number,
    min: number,
    max: number
) => {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

const median = (values: number[]) => {
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[middle] ?? 0;

    const lower = sorted[middle - 1] ?? 0;
    const upper = sorted[middle] ?? lower;
    return (lower + upper) / 2;
};

const formatMs = (value?: number) =>
    value == null ? 'n/a' : `${value.toFixed(value >= 100 ? 0 : 1)} ms`;

const buildBenchmarkKeyOptions = (algorithm: THashAlgorithm) =>
    algorithm.startsWith('HMAC-')
        ? {
              key: 'react-native-file-hash-benchmark-key',
              keyEncoding: 'utf8' as TKeyEncoding,
          }
        : undefined;

function AppContent() {
    const isDarkMode = useColorScheme() === 'dark';
    const insets = useSafeAreaInsets();
    const [selectedAlgo, setSelectedAlgo] = useState<THashAlgorithm>('SHA-256');
    const [textInput, setTextInput] = useState<string>('hello world');
    const [textEncoding, setTextEncoding] = useState<THashEncoding>('utf8');
    const [textHash, setTextHash] = useState<string>('');
    const [textElapsedMs, setTextElapsedMs] = useState<number | null>(null);
    const [textLoading, setTextLoading] = useState(false);
    const [textStatus, setTextStatus] = useState<string | null>(null);
    const [key, setKey] = useState<string>('');
    const [keyEncoding, setKeyEncoding] = useState<TKeyEncoding>('utf8');
    const [seedMode, setSeedMode] = useState<Xxh3SeedInputMode>('label');
    const [seedLabel, setSeedLabel] = useState<string>('media-cache-v1');
    const [seedInput, setSeedInput] = useState<string>('0x091677a156a7756e');
    const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
    const [hash, setHash] = useState<string>('');
    const [elapsedMs, setElapsedMs] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [fileStatus, setFileStatus] = useState<string | null>(null);
    const [benchmarkSizeMb, setBenchmarkSizeMb] = useState('200');
    const [benchmarkSamples, setBenchmarkSamples] = useState('3');
    const [benchmarkWarmups, setBenchmarkWarmups] = useState('1');
    const [benchmarkRunning, setBenchmarkRunning] = useState(false);
    const [benchmarkStatus, setBenchmarkStatus] = useState<string | null>(null);
    const [benchmarkResults, setBenchmarkResults] = useState<
        BenchmarkAlgorithmResult[]
    >([]);
    const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
    const [runtimeDiagnostics, setRuntimeDiagnostics] =
        useState<RuntimeDiagnostics | null>(null);
    const [runtimeInfoError, setRuntimeInfoError] = useState<string | null>(
        null
    );
    const isHmacAlgorithm = selectedAlgo.startsWith('HMAC-');
    const isXxh3Algorithm =
        selectedAlgo === 'XXH3-64' || selectedAlgo === 'XXH3-128';
    const fileAbortControllerRef = useRef<AbortController | null>(null);
    const textAbortControllerRef = useRef<AbortController | null>(null);
    const benchmarkAbortControllerRef = useRef<AbortController | null>(null);
    const keyPlaceholder = (() => {
        if (isHmacAlgorithm) {
            return 'HMAC key (empty string allowed)';
        }
        if (selectedAlgo === 'BLAKE3') {
            return 'Enter 32-byte key for keyed BLAKE3 (optional)';
        }
        return 'Leave empty: key is unsupported for this algorithm';
    })();
    const palette = useMemo(
        () =>
            isDarkMode
                ? {
                      bg: '#0f1115',
                      card: '#171a20',
                      text: '#f2f4f8',
                      muted: '#8a93a3',
                      accent: '#7dd3fc',
                      border: '#1f242e',
                  }
                : {
                      bg: '#f5f7fb',
                      card: '#ffffff',
                      text: '#0f172a',
                      muted: '#55607a',
                      accent: '#2563eb',
                      border: '#e5e7eb',
                  },
        [isDarkMode]
    );

    useEffect(() => {
        let mounted = true;
        getRuntimeInfo()
            .then((info) => {
                if (!mounted) return;
                setRuntimeInfo(info);
            })
            .catch((error: any) => {
                if (!mounted) return;
                setRuntimeInfoError(error?.message ?? 'Failed to load');
            });
        getRuntimeDiagnostics()
            .then((info) => {
                if (!mounted) return;
                setRuntimeDiagnostics(info);
                setRuntimeInfoError(null);
            })
            .catch((error: any) => {
                if (!mounted) return;
                setRuntimeInfoError(error?.message ?? 'Failed to load');
            });

        return () => {
            mounted = false;
            fileAbortControllerRef.current?.abort();
            textAbortControllerRef.current?.abort();
            benchmarkAbortControllerRef.current?.abort();
        };
    }, []);

    const zigCompatibilitySuffix =
        runtimeDiagnostics?.engine === 'zig' &&
        !runtimeDiagnostics.zigApiCompatible
            ? ' (mismatch)'
            : '';
    const runtimeEngine = runtimeInfo?.engine ?? runtimeDiagnostics?.engine;
    const zigApiLabel =
        runtimeDiagnostics?.engine === 'zig'
            ? `${runtimeDiagnostics.zigApiVersion}/${runtimeDiagnostics.zigExpectedApiVersion}${zigCompatibilitySuffix}`
            : 'n/a';
    const zigVersionLabel =
        runtimeDiagnostics?.engine === 'zig' &&
        runtimeDiagnostics.zigVersion.trim().length > 0
            ? runtimeDiagnostics.zigVersion
            : 'n/a';
    const showZigRuntimeDetails =
        runtimeDiagnostics?.engine === 'zig' || runtimeEngine === 'zig';

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

    const xxh3SeedValue = (() => {
        if (!isXxh3Algorithm) {
            return '';
        }

        try {
            const seed = buildXxh3Seed();
            if (seed === undefined) {
                return '';
            }
            if (typeof seed === 'bigint') {
                return `${seed.toString()}n`;
            }
            return `${seed}`;
        } catch (error: any) {
            return error?.message ?? 'Invalid seed';
        }
    })();

    const xxh3SeedLabel =
        seedMode === 'label' ? 'XXH3 seed label' : 'XXH3 seed';
    const xxh3SeedInputValue = seedMode === 'label' ? seedLabel : seedInput;
    const xxh3SeedPlaceholder =
        seedMode === 'label'
            ? 'media-cache-v1'
            : seedMode === 'number'
              ? '12345'
              : '0x091677a156a7756e';

    const buildHashOptions = (): HashOptions | undefined => {
        if (isXxh3Algorithm) {
            const seed = buildXxh3Seed();
            return seed !== undefined
                ? {
                      seed,
                  }
                : undefined;
        }

        if (!isHmacAlgorithm && key.length === 0) {
            return undefined;
        }

        return {
            key,
            keyEncoding,
        };
    };

    const pickFile = async () => {
        try {
            const res = await pick({
                type: [types.allFiles],
                copyTo: 'cachesDirectory',
                presentationStyle: 'fullScreen',
                allowMultiSelection: false,
            });
            const file = res?.[0];
            if (!file?.uri) {
                throw new Error('No file returned by picker');
            }

            // Ensure a stable local path (content:// can expire on iOS/Android)
            try {
                const [copyResult] = await keepLocalCopy({
                    files: [
                        {
                            uri: file.uri,
                            fileName: file?.name || 'document',
                        },
                    ],
                    destination: 'cachesDirectory',
                });
                if (copyResult.status === 'success') {
                    file.uri = copyResult.localUri;
                } else {
                    console.warn('keepLocalCopy failed', copyResult);
                }
            } catch (copyErr) {
                console.warn('keepLocalCopy threw', copyErr);
            }

            setPickedFile({
                name: file?.name ?? 'Unnamed file',
                uri: file?.uri,
                displayUri: file?.uri,
                size: file?.size,
            });
            setHash('');
            setElapsedMs(null);
            setFileStatus(null);
        } catch (err: any) {
            const isCancelled =
                err?.code === 'DOCUMENT_PICKER_CANCELED' ||
                err?.code === 'OPERATION_CANCELED' ||
                err?.message?.includes('User canceled directory picker') ||
                err?.message?.includes('The operation was cancelled');

            if (isCancelled) {
                return;
            }

            console.warn('Failed to pick file', err);
            Alert.alert('Could not pick file', 'Please try again.');
        }
    };

    const handleHash = async () => {
        if (!pickedFile) {
            Alert.alert('Pick a file first');
            return;
        }
        const controller = new AbortController();
        fileAbortControllerRef.current = controller;
        setLoading(true);
        setElapsedMs(null);
        setHash('');
        setFileStatus('Hashing file...');
        try {
            const options = buildHashOptions();
            const start = Date.now();
            const value = await fileHash(pickedFile.uri, {
                algorithm: selectedAlgo,
                hashOptions: options,
                signal: controller.signal,
            });

            const end = Date.now();
            setHash(value);
            setElapsedMs(end - start);
            setFileStatus(null);
        } catch (error: any) {
            if (isAbortError(error)) {
                setFileStatus('Cancelled');
                return;
            }

            console.warn('Hash failed', error);
            setFileStatus('Failed');
            Alert.alert('Hash failed', error?.message ?? 'Unknown error');
        } finally {
            if (fileAbortControllerRef.current === controller) {
                fileAbortControllerRef.current = null;
                setLoading(false);
            }
        }
    };

    const cancelFileHash = () => {
        const controller = fileAbortControllerRef.current;
        if (!controller || controller.signal.aborted) return;

        setFileStatus('Cancelling...');
        controller.abort();
    };

    const runBenchmark = async () => {
        if (!BenchmarkFile?.createFile) {
            Alert.alert(
                'Benchmark helper is unavailable',
                'Rebuild the native example app first.'
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

                        const start = nowMs();
                        const digest = await fileHash(filePath, {
                            algorithm,
                            hashOptions: buildBenchmarkKeyOptions(algorithm),
                            signal: controller.signal,
                        });
                        const elapsed = nowMs() - start;
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
                } catch (error: any) {
                    if (isAbortError(error) || controller.signal.aborted) {
                        throw error;
                    }

                    const result: BenchmarkAlgorithmResult = {
                        algorithm,
                        samplesMs: [],
                        error: error?.message ?? 'Unknown error',
                    };
                    results.push(result);
                    setBenchmarkResults([...results]);
                }
            }

            const payload = {
                version: 1,
                platform: Platform.OS,
                engine: runtimeEngine ?? 'unknown',
                sizeBytes,
                sizeMiB: sizeMb,
                samples,
                warmups,
                algorithms: benchmarkAlgorithms,
                results,
                createdAt: new Date().toISOString(),
            };
            const line = `ZFH_BENCHMARK_RESULT ${JSON.stringify(payload)}`;
            console.log(line);
            BenchmarkFile.log?.(line);
            setBenchmarkStatus('Benchmark complete');
        } catch (error: any) {
            if (isAbortError(error) || controller.signal.aborted) {
                setBenchmarkStatus('Benchmark cancelled');
                BenchmarkFile.log?.('ZFH_BENCHMARK_CANCELLED');
                return;
            }

            console.warn('Benchmark failed', error);
            BenchmarkFile.log?.(
                `ZFH_BENCHMARK_FAILED ${error?.message ?? 'Unknown error'}`
            );
            setBenchmarkStatus('Benchmark failed');
            Alert.alert('Benchmark failed', error?.message ?? 'Unknown error');
        } finally {
            if (benchmarkAbortControllerRef.current === controller) {
                benchmarkAbortControllerRef.current = null;
                setBenchmarkRunning(false);
            }
        }
    };

    const cancelBenchmark = () => {
        const controller = benchmarkAbortControllerRef.current;
        if (!controller || controller.signal.aborted) return;

        setBenchmarkStatus('Cancelling benchmark...');
        controller.abort();
    };

    const handleHashString = async () => {
        if (!textInput) {
            Alert.alert('Enter a string first');
            return;
        }
        const controller = new AbortController();
        textAbortControllerRef.current = controller;
        setTextLoading(true);
        setTextElapsedMs(null);
        setTextHash('');
        setTextStatus('Hashing string...');
        try {
            const options = buildHashOptions();
            const start = Date.now();
            const value = await stringHash(textInput, {
                algorithm: selectedAlgo,
                encoding: textEncoding,
                hashOptions: options,
                signal: controller.signal,
            });
            const end = Date.now();
            setTextHash(value);
            setTextElapsedMs(end - start);
            setTextStatus(null);
        } catch (error: any) {
            if (isAbortError(error)) {
                setTextStatus('Cancelled');
                return;
            }

            console.warn('Hash string failed', error);
            setTextStatus('Failed');
            Alert.alert(
                'Hash string failed',
                error?.message ?? 'Unknown error'
            );
        } finally {
            if (textAbortControllerRef.current === controller) {
                textAbortControllerRef.current = null;
                setTextLoading(false);
            }
        }
    };

    const cancelStringHash = () => {
        const controller = textAbortControllerRef.current;
        if (!controller || controller.signal.aborted) return;

        setTextStatus('Cancelling...');
        controller.abort();
    };

    return (
        <SafeAreaView
            edges={['top']}
            style={[styles.container, { backgroundColor: palette.bg }]}
        >
            <StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                backgroundColor={palette.bg}
            />
            <View
                pointerEvents="none"
                style={[
                    styles.runtimeBadge,
                    {
                        top: insets.top,
                        right: insets.right + 8,
                        backgroundColor: isDarkMode
                            ? 'rgba(23, 26, 32, 0.82)'
                            : 'rgba(255, 255, 255, 0.82)',
                        borderColor: palette.border,
                    },
                ]}
            >
                <Text
                    testID="runtime-engine"
                    style={[styles.runtimeBadgeLine, { color: palette.text }]}
                >
                    engine: {runtimeEngine ?? '...'}
                </Text>
                {showZigRuntimeDetails ? (
                    <>
                        <Text
                            testID="runtime-zig-abi"
                            style={[
                                styles.runtimeBadgeLine,
                                { color: palette.muted },
                            ]}
                        >
                            zig abi: {zigApiLabel}
                        </Text>
                        <Text
                            testID="runtime-zig-version"
                            style={[
                                styles.runtimeBadgeLine,
                                { color: palette.muted },
                            ]}
                        >
                            zig: {zigVersionLabel}
                        </Text>
                    </>
                ) : null}
                {runtimeInfoError ? (
                    <Text
                        style={[styles.runtimeBadgeLine, { color: '#ef4444' }]}
                    >
                        err: {runtimeInfoError}
                    </Text>
                ) : null}
            </View>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingBottom: insets.bottom + 20 },
                    ]}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: palette.text }]}>
                            File Hash
                        </Text>
                        <Text
                            style={[styles.subtitle, { color: palette.muted }]}
                        >
                            Native streaming hash (MD5 / SHA / XXH3 / BLAKE3)
                        </Text>
                    </View>

                    <View
                        style={[
                            styles.card,
                            {
                                backgroundColor: palette.card,
                                borderColor: palette.border,
                            },
                        ]}
                    >
                        <Text
                            style={[styles.cardTitle, { color: palette.text }]}
                        >
                            Benchmark
                        </Text>
                        <View style={styles.benchmarkGrid}>
                            <View style={styles.benchmarkField}>
                                <Text
                                    style={[
                                        styles.resultLabel,
                                        { color: palette.muted },
                                    ]}
                                >
                                    Size MiB
                                </Text>
                                <TextInput
                                    testID="benchmark-size-input"
                                    style={[
                                        styles.benchmarkInput,
                                        {
                                            color: palette.text,
                                            borderColor: palette.border,
                                            backgroundColor: isDarkMode
                                                ? '#11151d'
                                                : '#f5f7fb',
                                        },
                                    ]}
                                    keyboardType="number-pad"
                                    selectTextOnFocus
                                    value={benchmarkSizeMb}
                                    onChangeText={setBenchmarkSizeMb}
                                />
                            </View>
                            <View style={styles.benchmarkField}>
                                <Text
                                    style={[
                                        styles.resultLabel,
                                        { color: palette.muted },
                                    ]}
                                >
                                    Samples
                                </Text>
                                <TextInput
                                    testID="benchmark-samples-input"
                                    style={[
                                        styles.benchmarkInput,
                                        {
                                            color: palette.text,
                                            borderColor: palette.border,
                                            backgroundColor: isDarkMode
                                                ? '#11151d'
                                                : '#f5f7fb',
                                        },
                                    ]}
                                    keyboardType="number-pad"
                                    selectTextOnFocus
                                    value={benchmarkSamples}
                                    onChangeText={setBenchmarkSamples}
                                />
                            </View>
                            <View style={styles.benchmarkField}>
                                <Text
                                    style={[
                                        styles.resultLabel,
                                        { color: palette.muted },
                                    ]}
                                >
                                    Warmups
                                </Text>
                                <TextInput
                                    testID="benchmark-warmups-input"
                                    style={[
                                        styles.benchmarkInput,
                                        {
                                            color: palette.text,
                                            borderColor: palette.border,
                                            backgroundColor: isDarkMode
                                                ? '#11151d'
                                                : '#f5f7fb',
                                        },
                                    ]}
                                    keyboardType="number-pad"
                                    selectTextOnFocus
                                    value={benchmarkWarmups}
                                    onChangeText={setBenchmarkWarmups}
                                />
                            </View>
                        </View>
                        <View style={styles.actionRow}>
                            <Pressable
                                testID="benchmark-run"
                                style={[
                                    styles.button,
                                    styles.primaryAction,
                                    {
                                        backgroundColor: palette.accent,
                                        opacity: benchmarkRunning ? 0.6 : 1,
                                    },
                                ]}
                                disabled={benchmarkRunning}
                                onPress={runBenchmark}
                            >
                                {benchmarkRunning ? (
                                    <ActivityIndicator color="#0b1120" />
                                ) : (
                                    <Text style={styles.buttonText}>
                                        Run benchmark
                                    </Text>
                                )}
                            </Pressable>
                            {benchmarkRunning ? (
                                <Pressable
                                    testID="benchmark-cancel"
                                    style={[
                                        styles.button,
                                        styles.cancelButton,
                                        { borderColor: palette.border },
                                    ]}
                                    onPress={cancelBenchmark}
                                >
                                    <Text
                                        style={[
                                            styles.cancelButtonText,
                                            { color: palette.text },
                                        ]}
                                    >
                                        Cancel
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>
                        {benchmarkStatus ? (
                            <Text
                                testID={
                                    benchmarkStatus === 'Benchmark complete'
                                        ? 'benchmark-finished'
                                        : 'benchmark-status'
                                }
                                style={[
                                    styles.placeholder,
                                    { color: palette.muted },
                                ]}
                            >
                                {benchmarkStatus}
                            </Text>
                        ) : null}
                        {benchmarkResults.length > 0 ? (
                            <View
                                testID="benchmark-results"
                                style={styles.resultBox}
                            >
                                {benchmarkResults.map((result) => (
                                    <Text
                                        key={result.algorithm}
                                        style={[
                                            styles.resultText,
                                            { color: palette.text },
                                        ]}
                                    >
                                        {result.algorithm}:{' '}
                                        {result.error ??
                                            formatMs(result.medianMs)}
                                    </Text>
                                ))}
                            </View>
                        ) : null}
                    </View>

                    <View
                        style={[
                            styles.card,
                            {
                                backgroundColor: palette.card,
                                borderColor: palette.border,
                            },
                        ]}
                    >
                        <Text
                            style={[styles.cardTitle, { color: palette.text }]}
                        >
                            1. Algorithm
                        </Text>
                        <View style={styles.chipRow}>
                            {algorithms.map((algo) => {
                                const active = selectedAlgo === algo;
                                return (
                                    <Pressable
                                        key={algo}
                                        onPress={() => setSelectedAlgo(algo)}
                                        style={[
                                            styles.chip,
                                            {
                                                backgroundColor: active
                                                    ? palette.accent
                                                    : 'transparent',
                                                borderColor: palette.border,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={{
                                                color: active
                                                    ? '#0b1120'
                                                    : palette.text,
                                                fontWeight: active
                                                    ? '700'
                                                    : '500',
                                            }}
                                        >
                                            {algo}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>

                    <View
                        style={[
                            styles.card,
                            {
                                backgroundColor: palette.card,
                                borderColor: palette.border,
                            },
                        ]}
                    >
                        <Text
                            style={[styles.cardTitle, { color: palette.text }]}
                        >
                            2. Options (for file and string)
                        </Text>
                        {isXxh3Algorithm ? (
                            <>
                                <Text
                                    style={[
                                        styles.resultLabel,
                                        { color: palette.muted },
                                    ]}
                                >
                                    XXH3 seed input
                                </Text>
                                <View style={styles.encodingRow}>
                                    {xxh3SeedInputModes.map((mode) => {
                                        const active = seedMode === mode;
                                        return (
                                            <Pressable
                                                key={mode}
                                                onPress={() =>
                                                    setSeedMode(mode)
                                                }
                                                style={[
                                                    styles.chip,
                                                    {
                                                        backgroundColor: active
                                                            ? palette.accent
                                                            : 'transparent',
                                                        borderColor:
                                                            palette.border,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={{
                                                        color: active
                                                            ? '#0b1120'
                                                            : palette.text,
                                                        fontWeight: active
                                                            ? '700'
                                                            : '500',
                                                    }}
                                                >
                                                    {mode.toUpperCase()}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                                <Text
                                    style={[
                                        styles.resultLabel,
                                        { color: palette.muted },
                                    ]}
                                >
                                    {xxh3SeedLabel}
                                </Text>
                                <TextInput
                                    testID="xxh3-seed-input"
                                    style={[
                                        styles.singleLineInput,
                                        {
                                            color: palette.text,
                                            borderColor: palette.border,
                                            backgroundColor: isDarkMode
                                                ? '#11151d'
                                                : '#f5f7fb',
                                        },
                                    ]}
                                    placeholderTextColor={palette.muted}
                                    placeholder={xxh3SeedPlaceholder}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    value={xxh3SeedInputValue}
                                    onChangeText={(value) => {
                                        if (seedMode === 'label') {
                                            setSeedLabel(value);
                                        } else {
                                            setSeedInput(value);
                                        }
                                    }}
                                />
                                {xxh3SeedValue.length > 0 ? (
                                    <Text
                                        testID="xxh3-seed-value"
                                        style={[
                                            styles.optionValue,
                                            { color: palette.muted },
                                        ]}
                                        selectable
                                    >
                                        seed: {xxh3SeedValue}
                                    </Text>
                                ) : null}
                            </>
                        ) : (
                            <>
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            color: palette.text,
                                            borderColor: palette.border,
                                            backgroundColor: isDarkMode
                                                ? '#11151d'
                                                : '#f5f7fb',
                                        },
                                    ]}
                                    placeholderTextColor={palette.muted}
                                    placeholder={keyPlaceholder}
                                    multiline
                                    value={key}
                                    onChangeText={setKey}
                                />
                                <View style={styles.encodingRow}>
                                    {(
                                        [
                                            'utf8',
                                            'hex',
                                            'base64',
                                        ] as TKeyEncoding[]
                                    ).map((enc) => {
                                        const active = keyEncoding === enc;
                                        return (
                                            <Pressable
                                                key={enc}
                                                onPress={() =>
                                                    setKeyEncoding(enc)
                                                }
                                                style={[
                                                    styles.chip,
                                                    {
                                                        backgroundColor: active
                                                            ? palette.accent
                                                            : 'transparent',
                                                        borderColor:
                                                            palette.border,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={{
                                                        color: active
                                                            ? '#0b1120'
                                                            : palette.text,
                                                        fontWeight: active
                                                            ? '700'
                                                            : '500',
                                                    }}
                                                >
                                                    {enc.toUpperCase()}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </>
                        )}
                    </View>

                    <View
                        style={[
                            styles.card,
                            {
                                backgroundColor: palette.card,
                                borderColor: palette.border,
                            },
                        ]}
                    >
                        <Text
                            style={[styles.cardTitle, { color: palette.text }]}
                        >
                            3. Pick a file
                        </Text>
                        <Pressable
                            style={[
                                styles.button,
                                { backgroundColor: palette.accent },
                            ]}
                            onPress={pickFile}
                        >
                            <Text style={styles.buttonText}>Choose file</Text>
                        </Pressable>
                        {pickedFile ? (
                            <View style={styles.fileInfo}>
                                <Text
                                    style={[
                                        styles.fileName,
                                        { color: palette.text },
                                    ]}
                                >
                                    {pickedFile.name}
                                </Text>
                                <Text
                                    style={{
                                        color: palette.muted,
                                        marginTop: 2,
                                    }}
                                >
                                    {formatBytes(pickedFile.size)} •{' '}
                                    {pickedFile.displayUri}
                                </Text>
                            </View>
                        ) : (
                            <Text
                                style={[
                                    styles.placeholder,
                                    { color: palette.muted },
                                ]}
                            >
                                No file selected yet
                            </Text>
                        )}
                    </View>

                    <View
                        style={[
                            styles.card,
                            {
                                backgroundColor: palette.card,
                                borderColor: palette.border,
                            },
                        ]}
                    >
                        <Text
                            style={[styles.cardTitle, { color: palette.text }]}
                        >
                            4. Hash file
                        </Text>
                        <View style={styles.actionRow}>
                            <Pressable
                                style={[
                                    styles.button,
                                    styles.primaryAction,
                                    {
                                        backgroundColor: palette.accent,
                                        opacity:
                                            pickedFile && !loading ? 1 : 0.6,
                                    },
                                ]}
                                disabled={!pickedFile || loading}
                                onPress={handleHash}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#0b1120" />
                                ) : (
                                    <Text style={styles.buttonText}>
                                        Hash file
                                    </Text>
                                )}
                            </Pressable>
                            {loading ? (
                                <Pressable
                                    style={[
                                        styles.button,
                                        styles.cancelButton,
                                        { borderColor: palette.border },
                                    ]}
                                    onPress={cancelFileHash}
                                >
                                    <Text
                                        style={[
                                            styles.cancelButtonText,
                                            { color: palette.text },
                                        ]}
                                    >
                                        Cancel
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>

                        {hash ? (
                            <View style={styles.resultBox}>
                                <Text
                                    style={[
                                        styles.resultLabel,
                                        { color: palette.muted },
                                    ]}
                                >
                                    Result
                                </Text>
                                <Text
                                    style={[
                                        styles.resultText,
                                        { color: palette.text },
                                    ]}
                                    selectable
                                    testID="file-hash-result"
                                >
                                    {hash}
                                </Text>
                                <Text
                                    style={[
                                        styles.resultLabel,
                                        styles.resultHint,
                                        { color: palette.muted },
                                    ]}
                                >
                                    Long press the hex digest to copy it.
                                </Text>
                                {elapsedMs != null && (
                                    <Text
                                        style={[
                                            styles.resultLabel,
                                            { color: palette.muted },
                                        ]}
                                    >
                                        {elapsedMs.toFixed(0)} ms
                                    </Text>
                                )}
                            </View>
                        ) : (
                            <Text
                                style={[
                                    styles.placeholder,
                                    { color: palette.muted },
                                ]}
                            >
                                {fileStatus ??
                                    'Pick a file and tap “Hash file”'}
                            </Text>
                        )}
                    </View>

                    <View
                        style={[
                            styles.card,
                            {
                                backgroundColor: palette.card,
                                borderColor: palette.border,
                            },
                        ]}
                    >
                        <Text
                            style={[styles.cardTitle, { color: palette.text }]}
                        >
                            5. Hash string (small payloads)
                        </Text>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    color: palette.text,
                                    borderColor: palette.border,
                                    backgroundColor: isDarkMode
                                        ? '#11151d'
                                        : '#f5f7fb',
                                },
                            ]}
                            placeholderTextColor={palette.muted}
                            placeholder="Enter text or base64 (for large data use file hashing)"
                            multiline
                            value={textInput}
                            onChangeText={setTextInput}
                        />
                        <View style={styles.encodingRow}>
                            {(['utf8', 'base64'] as THashEncoding[]).map(
                                (enc) => {
                                    const active = textEncoding === enc;
                                    return (
                                        <Pressable
                                            key={enc}
                                            onPress={() => setTextEncoding(enc)}
                                            style={[
                                                styles.chip,
                                                {
                                                    backgroundColor: active
                                                        ? palette.accent
                                                        : 'transparent',
                                                    borderColor: palette.border,
                                                },
                                            ]}
                                        >
                                            <Text
                                                style={{
                                                    color: active
                                                        ? '#0b1120'
                                                        : palette.text,
                                                    fontWeight: active
                                                        ? '700'
                                                        : '500',
                                                }}
                                            >
                                                {enc.toUpperCase()}
                                            </Text>
                                        </Pressable>
                                    );
                                }
                            )}
                        </View>
                        <View style={styles.actionRow}>
                            <Pressable
                                style={[
                                    styles.button,
                                    styles.primaryAction,
                                    {
                                        backgroundColor: palette.accent,
                                        opacity:
                                            textInput && !textLoading ? 1 : 0.6,
                                    },
                                ]}
                                disabled={!textInput || textLoading}
                                onPress={handleHashString}
                            >
                                {textLoading ? (
                                    <ActivityIndicator color="#0b1120" />
                                ) : (
                                    <Text style={styles.buttonText}>
                                        Hash string
                                    </Text>
                                )}
                            </Pressable>
                            {textLoading ? (
                                <Pressable
                                    style={[
                                        styles.button,
                                        styles.cancelButton,
                                        { borderColor: palette.border },
                                    ]}
                                    onPress={cancelStringHash}
                                >
                                    <Text
                                        style={[
                                            styles.cancelButtonText,
                                            { color: palette.text },
                                        ]}
                                    >
                                        Cancel
                                    </Text>
                                </Pressable>
                            ) : null}
                        </View>

                        {textHash ? (
                            <View style={styles.resultBox}>
                                <Text
                                    style={[
                                        styles.resultLabel,
                                        { color: palette.muted },
                                    ]}
                                >
                                    Result
                                </Text>
                                <Text
                                    style={[
                                        styles.resultText,
                                        { color: palette.text },
                                    ]}
                                    selectable
                                    testID="string-hash-result"
                                >
                                    {textHash}
                                </Text>
                                <Text
                                    style={[
                                        styles.resultLabel,
                                        styles.resultHint,
                                        { color: palette.muted },
                                    ]}
                                >
                                    Long press the hex digest to copy it.
                                </Text>
                                {textElapsedMs != null && (
                                    <Text
                                        style={[
                                            styles.resultLabel,
                                            { color: palette.muted },
                                        ]}
                                    >
                                        {textElapsedMs.toFixed(0)} ms
                                    </Text>
                                )}
                            </View>
                        ) : (
                            <Text
                                style={[
                                    styles.placeholder,
                                    { color: palette.muted },
                                ]}
                            >
                                {textStatus ??
                                    'Enter a small string/base64 and tap “Hash string”. For large data use file hashing to stream from disk.'}
                            </Text>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function App() {
    return (
        <SafeAreaProvider>
            <AppContent />
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 4,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
    },
    subtitle: {
        fontSize: 14,
        marginTop: 4,
    },
    card: {
        marginHorizontal: 16,
        marginTop: 12,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 10,
    },
    button: {
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        marginTop: 4,
    },
    primaryAction: {
        flex: 1,
    },
    cancelButton: {
        minWidth: 96,
        paddingHorizontal: 14,
        backgroundColor: 'transparent',
        borderWidth: 1,
    },
    buttonText: {
        color: '#0b1120',
        fontWeight: '700',
        fontSize: 15,
    },
    cancelButtonText: {
        fontWeight: '700',
        fontSize: 15,
    },
    fileInfo: {
        marginTop: 10,
    },
    fileName: {
        fontSize: 15,
        fontWeight: '600',
    },
    placeholder: {
        marginTop: 8,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    encodingRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
        marginBottom: 8,
    },
    benchmarkGrid: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    benchmarkField: {
        flex: 1,
        minWidth: 0,
    },
    benchmarkInput: {
        height: 44,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
        fontSize: 15,
    },
    resultBox: {
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb33',
        backgroundColor: '#00000008',
    },
    resultLabel: {
        fontSize: 12,
        marginBottom: 6,
    },
    resultText: {
        fontSize: 13,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
        lineHeight: 20,
    },
    resultHint: {
        marginTop: 4,
        marginBottom: 2,
        fontSize: 11,
        lineHeight: 15,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    input: {
        minHeight: 80,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        textAlignVertical: 'top',
        marginBottom: 8,
    },
    singleLineInput: {
        height: 44,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        fontSize: 15,
        marginBottom: 8,
    },
    optionValue: {
        fontSize: 12,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
        lineHeight: 18,
    },
    runtimeBadge: {
        position: 'absolute',
        zIndex: 10,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        minWidth: 132,
    },
    runtimeBadgeLine: {
        fontSize: 11,
        lineHeight: 15,
    },
});

export default App;
