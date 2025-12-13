#ifndef HASH_NATIVE_H
#define HASH_NATIVE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void *fh_xxh3_64_init(void);
void *fh_xxh3_128_init(void);
void fh_xxh3_64_update(void *state, const void *data, size_t length);
void fh_xxh3_128_update(void *state, const void *data, size_t length);
uint64_t fh_xxh3_64_digest(void *state);
void fh_xxh3_128_digest(void *state, uint64_t out[2]);
void fh_xxh3_free(void *state);

void *fh_blake3_init(void);
void fh_blake3_update(void *state, const void *data, size_t length);
void fh_blake3_digest(void *state, uint8_t *out, size_t outLen);
void fh_blake3_free(void *state);
void *fh_blake3_init_keyed(const uint8_t *key);

#ifdef __cplusplus
}
#endif

#endif /* HASH_NATIVE_H */
