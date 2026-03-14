package com.preeternal.filehash

import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException

class Sha512tTest {
    @Test
    fun sha512_224_known_vector_abc() {
        val digest = Sha512t.digestBytes(
            "abc".toByteArray(Charsets.UTF_8),
            Sha512t.Variant.SHA_512_224
        )
        assertEquals(
            "4634270f707b6a54daae7530460842e20e37ed265ceee9a43e8924aa",
            hex(digest)
        )
    }

    @Test
    fun sha512_256_known_vector_abc() {
        val digest = Sha512t.digestBytes(
            "abc".toByteArray(Charsets.UTF_8),
            Sha512t.Variant.SHA_512_256
        )
        assertEquals(
            "53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23",
            hex(digest)
        )
    }

    @Test
    fun sha512_224_stream_equals_bytes() {
        val bytes = ByteArray(8192) { i -> (i * 17 + 11).toByte() }
        val bytesDigest = Sha512t.digestBytes(bytes, Sha512t.Variant.SHA_512_224)
        val streamDigest = Sha512t.digestStream(
            ByteArrayInputStream(bytes),
            1024,
            Sha512t.Variant.SHA_512_224
        )
        assertEquals(hex(bytesDigest), hex(streamDigest))
    }

    @Test
    fun sha512_256_stream_equals_bytes() {
        val bytes = ByteArray(8192) { i -> (i * 31 + 7).toByte() }
        val bytesDigest = Sha512t.digestBytes(bytes, Sha512t.Variant.SHA_512_256)
        val streamDigest = Sha512t.digestStream(
            ByteArrayInputStream(bytes),
            1024,
            Sha512t.Variant.SHA_512_256
        )
        assertEquals(hex(bytesDigest), hex(streamDigest))
    }

    @Test
    fun sha512_224_matches_provider_when_available() {
        val input = "provider parity: sha512/224".toByteArray(Charsets.UTF_8)
        val fallbackHex = hex(Sha512t.digestBytes(input, Sha512t.Variant.SHA_512_224))

        val providerHex = tryProviderDigest("SHA-512/224", input)
        assumeTrue("Provider does not support SHA-512/224", providerHex != null)
        assertEquals(providerHex, fallbackHex)
    }

    @Test
    fun sha512_256_matches_provider_when_available() {
        val input = "provider parity: sha512/256".toByteArray(Charsets.UTF_8)
        val fallbackHex = hex(Sha512t.digestBytes(input, Sha512t.Variant.SHA_512_256))

        val providerHex = tryProviderDigest("SHA-512/256", input)
        assumeTrue("Provider does not support SHA-512/256", providerHex != null)
        assertEquals(providerHex, fallbackHex)
    }

    private fun tryProviderDigest(algorithm: String, bytes: ByteArray): String? {
        return try {
            hex(MessageDigest.getInstance(algorithm).digest(bytes))
        } catch (_: NoSuchAlgorithmException) {
            null
        }
    }

    private fun hex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }
}
