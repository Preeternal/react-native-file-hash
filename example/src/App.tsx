/* eslint-disable react-native/no-inline-styles */
import { useMemo, useState } from 'react';
import {
    fileHash,
    hashString,
    type THashAlgorithm,
    type THashEncoding,
    type THashMode,
    type TKeyEncoding,
} from '@preeternal/react-native-file-hash';
import { keepLocalCopy, pick, types } from '@react-native-documents/picker';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
    ActivityIndicator,
    Alert,
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
    'XXH3-64',
    'XXH3-128',
    'BLAKE3',
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

function App() {
    const isDarkMode = useColorScheme() === 'dark';
    const [selectedAlgo, setSelectedAlgo] = useState<THashAlgorithm>('SHA-256');
    const [textInput, setTextInput] = useState<string>('hello world');
    const [textEncoding, setTextEncoding] = useState<THashEncoding>('utf8');
    const [textHash, setTextHash] = useState<string>('');
    const [textElapsedMs, setTextElapsedMs] = useState<number | null>(null);
    const [textLoading, setTextLoading] = useState(false);
    const [mode, setMode] = useState<THashMode>('hash');
    const [key, setKey] = useState<string>('');
    const [keyEncoding, setKeyEncoding] = useState<TKeyEncoding>('utf8');
    const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
    const [hash, setHash] = useState<string>('');
    const [elapsedMs, setElapsedMs] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

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
        setLoading(true);
        setElapsedMs(null);
        try {
            const options =
                mode === 'hash'
                    ? undefined
                    : ({
                          mode,
                          key,
                          keyEncoding,
                      } as any);
            const start = performance.now();
            const value = await fileHash(pickedFile.uri, selectedAlgo, options);
            const end = performance.now();
            setHash(value);
            setElapsedMs(end - start);
        } catch (error: any) {
            console.warn('Hash failed', error);
            Alert.alert('Hash failed', error?.message ?? 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleHashString = async () => {
        if (!textInput) {
            Alert.alert('Enter a string first');
            return;
        }
        setTextLoading(true);
        setTextElapsedMs(null);
        try {
            const options =
                mode === 'hash'
                    ? undefined
                    : ({
                          mode,
                          key,
                          keyEncoding,
                      } as any);
            const start = performance.now();
            const value = await hashString(
                textInput,
                selectedAlgo,
                textEncoding,
                options
            );
            const end = performance.now();
            setTextHash(value);
            setTextElapsedMs(end - start);
        } catch (error: any) {
            console.warn('Hash string failed', error);
            Alert.alert(
                'Hash string failed',
                error?.message ?? 'Unknown error'
            );
        } finally {
            setTextLoading(false);
        }
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView
                style={[styles.container, { backgroundColor: palette.bg }]}
            >
                <StatusBar
                    barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                    backgroundColor={palette.bg}
                />
                <ScrollView contentContainerStyle={styles.scrollContent}>
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
                            2. Mode & Key (for file and string)
                        </Text>
                        <View style={styles.encodingRow}>
                            {(['hash', 'hmac', 'keyed'] as THashMode[]).map(
                                (m) => {
                                    const active = mode === m;
                                    return (
                                        <Pressable
                                            key={m}
                                            onPress={() => setMode(m)}
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
                                                {m.toUpperCase()}
                                            </Text>
                                        </Pressable>
                                    );
                                }
                            )}
                        </View>
                        {mode !== 'hash' && (
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
                                    placeholder={
                                        mode === 'keyed'
                                            ? 'Enter 32-byte key (utf8/hex/base64)'
                                            : 'Enter key'
                                    }
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
                        <Pressable
                            style={[
                                styles.button,
                                {
                                    backgroundColor: palette.accent,
                                    opacity: pickedFile && !loading ? 1 : 0.6,
                                },
                            ]}
                            disabled={
                                !pickedFile ||
                                loading ||
                                (mode !== 'hash' && key.trim().length === 0)
                            }
                            onPress={handleHash}
                        >
                            {loading ? (
                                <ActivityIndicator color="#0b1120" />
                            ) : (
                                <Text style={styles.buttonText}>Hash file</Text>
                            )}
                        </Pressable>

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
                                >
                                    {hash}
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
                                Pick a file and tap “Hash file”
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
                        <Pressable
                            style={[
                                styles.button,
                                {
                                    backgroundColor: palette.accent,
                                    opacity:
                                        textInput && !textLoading ? 1 : 0.6,
                                },
                            ]}
                            disabled={
                                !textInput ||
                                textLoading ||
                                (mode !== 'hash' && key.trim().length === 0)
                            }
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
                                >
                                    {textHash}
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
                                Enter a small string/base64 and tap “Hash
                                string”. For large data use file hashing to
                                stream from disk.
                            </Text>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>
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
    buttonText: {
        color: '#0b1120',
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
});

export default App;
