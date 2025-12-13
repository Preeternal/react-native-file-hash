import FileHash, { type THashAlgorithm } from '../NativeFileHash';
import { fileHash, hashString } from '../index';

jest.mock('../NativeFileHash', () => ({
    __esModule: true,
    default: {
        fileHash: jest.fn(
            async (_path: string, _algo: string, _opts: any) =>
                'native-file-hash'
        ),
        hashString: jest.fn(
            async (_text: string, _algo: string, _enc: string, _opts: any) =>
                'native-string-hash'
        ),
    },
}));

const castAlgo = (s: string) => s as THashAlgorithm;

describe('fileHash options validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('passes defaults when options omitted (hash mode)', async () => {
        await fileHash('path');
        expect(FileHash.fileHash).toHaveBeenCalledWith('path', 'SHA-256', {
            mode: 'hash',
        });
    });

    it('rejects HMAC on unsupported algorithm', () => {
        expect(() =>
            fileHash('p', castAlgo('MD5'), { mode: 'hmac', key: 'k' })
        ).toThrow(/HMAC is only supported/);
    });

    it('accepts HMAC on SHA-256 and preserves key options', async () => {
        await fileHash('p', castAlgo('SHA-256'), {
            mode: 'hmac',
            key: 'secret',
            keyEncoding: 'utf8',
        });
        expect(FileHash.fileHash).toHaveBeenCalledWith('p', 'SHA-256', {
            mode: 'hmac',
            key: 'secret',
            keyEncoding: 'utf8',
        });
    });

    it('rejects keyed mode on non-BLAKE3', () => {
        expect(() =>
            fileHash('p', castAlgo('SHA-256'), {
                mode: 'keyed',
                key: '0'.repeat(64),
                keyEncoding: 'hex',
            })
        ).toThrow(/Keyed mode is only supported for BLAKE3/);
    });

    it('rejects keyed BLAKE3 with wrong key length', () => {
        expect(() =>
            fileHash('p', castAlgo('BLAKE3'), {
                mode: 'keyed',
                key: 'short',
            })
        ).toThrow(/32-byte key/);
    });

    it('accepts keyed BLAKE3 with 32-byte key (hex)', async () => {
        const hexKey = 'aa'.repeat(32);
        await fileHash('p', castAlgo('BLAKE3'), {
            mode: 'keyed',
            key: hexKey,
            keyEncoding: 'hex',
        });
        expect(FileHash.fileHash).toHaveBeenCalledWith('p', 'BLAKE3', {
            mode: 'keyed',
            key: hexKey,
            keyEncoding: 'hex',
        });
    });

    it('accepts keyed BLAKE3 with 32-byte key (base64)', async () => {
        const buf = Buffer.alloc(32, 1);
        const b64 = buf.toString('base64');
        await fileHash('p', castAlgo('BLAKE3'), {
            mode: 'keyed',
            key: b64,
            keyEncoding: 'base64',
        });
        expect(FileHash.fileHash).toHaveBeenCalledWith('p', 'BLAKE3', {
            mode: 'keyed',
            key: b64,
            keyEncoding: 'base64',
        });
    });
});

describe('hashString mirrors validation', () => {
    beforeEach(() => jest.clearAllMocks());

    it('uses defaults when options omitted', async () => {
        await hashString('abc');
        expect(FileHash.hashString).toHaveBeenCalledWith(
            'abc',
            'SHA-256',
            'utf8',
            { mode: 'hash' }
        );
    });

    it('rejects missing key for hmac/keyed', () => {
        expect(() =>
            hashString('abc', castAlgo('SHA-256'), 'utf8', { mode: 'hmac' })
        ).toThrow(/Key is required/);
    });

    it('accepts empty string input', async () => {
        await hashString('', castAlgo('SHA-256'));
        expect(FileHash.hashString).toHaveBeenCalledWith(
            '',
            'SHA-256',
            'utf8',
            { mode: 'hash' }
        );
    });

    it('accepts long HMAC key without length restriction', async () => {
        const longKey = 'a'.repeat(512);
        await hashString('abc', castAlgo('SHA-256'), 'utf8', {
            mode: 'hmac',
            key: longKey,
        });
        expect(FileHash.hashString).toHaveBeenCalledWith(
            'abc',
            'SHA-256',
            'utf8',
            { mode: 'hmac', key: longKey, keyEncoding: 'utf8' }
        );
    });
});
