#import "HashNative.h"
#import "xxhash.h"
#import "blake3.h"

void *fh_blake3_init_keyed(const uint8_t *key) {
    if (key == nullptr) return nullptr;
    blake3_hasher *state = new blake3_hasher();
    if (state == nullptr) return nullptr;
    blake3_hasher_init_keyed(state, key);
    return state;
}

void *fh_xxh3_64_init(void) {
    XXH3_state_t *state = XXH3_createState();
    if (state == nullptr) {
        return nullptr;
    }
    XXH3_64bits_reset(state);
    return state;
}

void *fh_xxh3_128_init(void) {
    XXH3_state_t *state = XXH3_createState();
    if (state == nullptr) {
        return nullptr;
    }
    XXH3_128bits_reset(state);
    return state;
}

void fh_xxh3_64_update(void *state, const void *data, size_t length) {
    if (state == nullptr || data == nullptr || length == 0) return;
    XXH3_64bits_update((XXH3_state_t *)state, data, length);
}

void fh_xxh3_128_update(void *state, const void *data, size_t length) {
    if (state == nullptr || data == nullptr || length == 0) return;
    XXH3_128bits_update((XXH3_state_t *)state, data, length);
}

uint64_t fh_xxh3_64_digest(void *state) {
    if (state == nullptr) return 0;
    return XXH3_64bits_digest((XXH3_state_t *)state);
}

void fh_xxh3_128_digest(void *state, uint64_t out[2]) {
    if (state == nullptr || out == nullptr) return;
    XXH128_hash_t digest = XXH3_128bits_digest((XXH3_state_t *)state);
    out[0] = digest.low64;
    out[1] = digest.high64;
}

void fh_xxh3_free(void *state) {
    if (state != nullptr) {
        XXH3_freeState((XXH3_state_t *)state);
    }
}

void *fh_blake3_init(void) {
    blake3_hasher *state = new blake3_hasher();
    if (state == nullptr) return nullptr;
    blake3_hasher_init(state);
    return state;
}

void fh_blake3_update(void *state, const void *data, size_t length) {
    if (state == nullptr || data == nullptr || length == 0) return;
    blake3_hasher_update((blake3_hasher *)state, data, length);
}

void fh_blake3_digest(void *state, uint8_t *out, size_t outLen) {
    if (state == nullptr || out == nullptr || outLen == 0) return;
    blake3_hasher_finalize((blake3_hasher *)state, out, outLen);
}

void fh_blake3_free(void *state) {
    if (state != nullptr) {
        delete (blake3_hasher *)state;
    }
}
