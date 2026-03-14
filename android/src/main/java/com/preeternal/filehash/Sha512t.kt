package com.preeternal.filehash

import java.io.InputStream

internal object Sha512t {
    internal enum class Variant(val outputSize: Int, val iv: LongArray) {
        SHA_512_224(
            outputSize = 28,
            iv = longArrayOf(
                0x8c3d37c819544da2uL.toLong(),
                0x73e1996689dcd4d6uL.toLong(),
                0x1dfab7ae32ff9c82uL.toLong(),
                0x679dd514582f9fcfuL.toLong(),
                0x0f6d2b697bd44da8uL.toLong(),
                0x77e36f7304c48942uL.toLong(),
                0x3f9d85a86a1d36c8uL.toLong(),
                0x1112e6ad91d692a1uL.toLong()
            )
        ),
        SHA_512_256(
            outputSize = 32,
            iv = longArrayOf(
                0x22312194fc2bf72cuL.toLong(),
                0x9f555fa3c84c64c2uL.toLong(),
                0x2393b86b6f53b151uL.toLong(),
                0x963877195940eabduL.toLong(),
                0x96283ee2a88effe3uL.toLong(),
                0xbe5e1e2553863992uL.toLong(),
                0x2b0199fc2c85b8aauL.toLong(),
                0x0eb72ddc81c52ca2uL.toLong()
            )
        )
    }

    fun digestBytes(data: ByteArray, variant: Variant): ByteArray {
        val digest = Digest(variant)
        digest.update(data, 0, data.size)
        return digest.finalResult()
    }

    fun digestStream(stream: InputStream, bufferSize: Int, variant: Variant): ByteArray {
        val digest = Digest(variant)
        val buffer = ByteArray(bufferSize)
        var read: Int
        while (stream.read(buffer).also { read = it } != -1) {
            if (read > 0) {
                digest.update(buffer, 0, read)
            }
        }
        return digest.finalResult()
    }

    private class Digest(variant: Variant) {
        private val state = variant.iv.copyOf()
        private val outSize = variant.outputSize
        private val block = ByteArray(BLOCK_SIZE)
        private var blockPos = 0
        private var byteCountLow = 0L
        private var byteCountHigh = 0L
        private var finished = false

        fun update(data: ByteArray, offset: Int, length: Int) {
            check(!finished) { "Digest already finalized" }
            if (length <= 0) return

            var inPos = offset
            var remaining = length
            while (remaining > 0) {
                val copyLen = minOf(remaining, BLOCK_SIZE - blockPos)
                System.arraycopy(data, inPos, block, blockPos, copyLen)
                blockPos += copyLen
                inPos += copyLen
                remaining -= copyLen
                if (blockPos == BLOCK_SIZE) {
                    processBlock(block, 0)
                    blockPos = 0
                }
            }
            addBytes(length)
        }

        fun finalResult(): ByteArray {
            check(!finished) { "Digest already finalized" }
            finished = true

            val bitLenLow = byteCountLow shl 3
            val bitLenHigh = (byteCountHigh shl 3) or (byteCountLow ushr 61)

            block[blockPos++] = 0x80.toByte()
            if (blockPos > 112) {
                while (blockPos < BLOCK_SIZE) {
                    block[blockPos++] = 0
                }
                processBlock(block, 0)
                blockPos = 0
            }
            while (blockPos < 112) {
                block[blockPos++] = 0
            }

            writeLongBE(block, 112, bitLenHigh)
            writeLongBE(block, 120, bitLenLow)
            processBlock(block, 0)

            val full = ByteArray(64)
            for (i in 0 until 8) {
                writeLongBE(full, i * 8, state[i])
            }
            return full.copyOf(outSize)
        }

        private fun addBytes(value: Int) {
            val prev = byteCountLow
            byteCountLow += value.toLong()
            if (java.lang.Long.compareUnsigned(byteCountLow, prev) < 0) {
                byteCountHigh += 1
            }
        }

        private fun processBlock(input: ByteArray, offset: Int) {
            val w = LongArray(80)
            for (i in 0 until 16) {
                w[i] = readLongBE(input, offset + i * 8)
            }
            for (i in 16 until 80) {
                w[i] = smallSigma1(w[i - 2]) + w[i - 7] + smallSigma0(w[i - 15]) + w[i - 16]
            }

            var a = state[0]
            var b = state[1]
            var c = state[2]
            var d = state[3]
            var e = state[4]
            var f = state[5]
            var g = state[6]
            var h = state[7]

            for (i in 0 until 80) {
                val t1 = h + bigSigma1(e) + ch(e, f, g) + K[i] + w[i]
                val t2 = bigSigma0(a) + maj(a, b, c)

                h = g
                g = f
                f = e
                e = d + t1
                d = c
                c = b
                b = a
                a = t1 + t2
            }

            state[0] += a
            state[1] += b
            state[2] += c
            state[3] += d
            state[4] += e
            state[5] += f
            state[6] += g
            state[7] += h
        }
    }

    private fun ch(x: Long, y: Long, z: Long): Long = (x and y) xor (x.inv() and z)
    private fun maj(x: Long, y: Long, z: Long): Long = (x and y) xor (x and z) xor (y and z)

    private fun bigSigma0(x: Long): Long = rotr(x, 28) xor rotr(x, 34) xor rotr(x, 39)
    private fun bigSigma1(x: Long): Long = rotr(x, 14) xor rotr(x, 18) xor rotr(x, 41)
    private fun smallSigma0(x: Long): Long = rotr(x, 1) xor rotr(x, 8) xor (x ushr 7)
    private fun smallSigma1(x: Long): Long = rotr(x, 19) xor rotr(x, 61) xor (x ushr 6)

    private fun rotr(value: Long, n: Int): Long = (value ushr n) or (value shl (64 - n))

    private fun readLongBE(data: ByteArray, offset: Int): Long {
        return ((data[offset].toLong() and 0xff) shl 56) or
            ((data[offset + 1].toLong() and 0xff) shl 48) or
            ((data[offset + 2].toLong() and 0xff) shl 40) or
            ((data[offset + 3].toLong() and 0xff) shl 32) or
            ((data[offset + 4].toLong() and 0xff) shl 24) or
            ((data[offset + 5].toLong() and 0xff) shl 16) or
            ((data[offset + 6].toLong() and 0xff) shl 8) or
            (data[offset + 7].toLong() and 0xff)
    }

    private fun writeLongBE(out: ByteArray, offset: Int, value: Long) {
        out[offset] = (value ushr 56).toByte()
        out[offset + 1] = (value ushr 48).toByte()
        out[offset + 2] = (value ushr 40).toByte()
        out[offset + 3] = (value ushr 32).toByte()
        out[offset + 4] = (value ushr 24).toByte()
        out[offset + 5] = (value ushr 16).toByte()
        out[offset + 6] = (value ushr 8).toByte()
        out[offset + 7] = value.toByte()
    }

    private const val BLOCK_SIZE = 128

    private val K = longArrayOf(
        0x428a2f98d728ae22uL.toLong(), 0x7137449123ef65cduL.toLong(),
        0xb5c0fbcfec4d3b2fuL.toLong(), 0xe9b5dba58189dbbcuL.toLong(),
        0x3956c25bf348b538uL.toLong(), 0x59f111f1b605d019uL.toLong(),
        0x923f82a4af194f9buL.toLong(), 0xab1c5ed5da6d8118uL.toLong(),
        0xd807aa98a3030242uL.toLong(), 0x12835b0145706fbeuL.toLong(),
        0x243185be4ee4b28cuL.toLong(), 0x550c7dc3d5ffb4e2uL.toLong(),
        0x72be5d74f27b896fuL.toLong(), 0x80deb1fe3b1696b1uL.toLong(),
        0x9bdc06a725c71235uL.toLong(), 0xc19bf174cf692694uL.toLong(),
        0xe49b69c19ef14ad2uL.toLong(), 0xefbe4786384f25e3uL.toLong(),
        0x0fc19dc68b8cd5b5uL.toLong(), 0x240ca1cc77ac9c65uL.toLong(),
        0x2de92c6f592b0275uL.toLong(), 0x4a7484aa6ea6e483uL.toLong(),
        0x5cb0a9dcbd41fbd4uL.toLong(), 0x76f988da831153b5uL.toLong(),
        0x983e5152ee66dfabuL.toLong(), 0xa831c66d2db43210uL.toLong(),
        0xb00327c898fb213fuL.toLong(), 0xbf597fc7beef0ee4uL.toLong(),
        0xc6e00bf33da88fc2uL.toLong(), 0xd5a79147930aa725uL.toLong(),
        0x06ca6351e003826fuL.toLong(), 0x142929670a0e6e70uL.toLong(),
        0x27b70a8546d22ffcuL.toLong(), 0x2e1b21385c26c926uL.toLong(),
        0x4d2c6dfc5ac42aeduL.toLong(), 0x53380d139d95b3dfuL.toLong(),
        0x650a73548baf63deuL.toLong(), 0x766a0abb3c77b2a8uL.toLong(),
        0x81c2c92e47edaee6uL.toLong(), 0x92722c851482353buL.toLong(),
        0xa2bfe8a14cf10364uL.toLong(), 0xa81a664bbc423001uL.toLong(),
        0xc24b8b70d0f89791uL.toLong(), 0xc76c51a30654be30uL.toLong(),
        0xd192e819d6ef5218uL.toLong(), 0xd69906245565a910uL.toLong(),
        0xf40e35855771202auL.toLong(), 0x106aa07032bbd1b8uL.toLong(),
        0x19a4c116b8d2d0c8uL.toLong(), 0x1e376c085141ab53uL.toLong(),
        0x2748774cdf8eeb99uL.toLong(), 0x34b0bcb5e19b48a8uL.toLong(),
        0x391c0cb3c5c95a63uL.toLong(), 0x4ed8aa4ae3418acbuL.toLong(),
        0x5b9cca4f7763e373uL.toLong(), 0x682e6ff3d6b2b8a3uL.toLong(),
        0x748f82ee5defb2fcuL.toLong(), 0x78a5636f43172f60uL.toLong(),
        0x84c87814a1f0ab72uL.toLong(), 0x8cc702081a6439ecuL.toLong(),
        0x90befffa23631e28uL.toLong(), 0xa4506cebde82bde9uL.toLong(),
        0xbef9a3f7b2c67915uL.toLong(), 0xc67178f2e372532buL.toLong(),
        0xca273eceea26619cuL.toLong(), 0xd186b8c721c0c207uL.toLong(),
        0xeada7dd6cde0eb1euL.toLong(), 0xf57d4f7fee6ed178uL.toLong(),
        0x06f067aa72176fbauL.toLong(), 0x0a637dc5a2c898a6uL.toLong(),
        0x113f9804bef90daeuL.toLong(), 0x1b710b35131c471buL.toLong(),
        0x28db77f523047d84uL.toLong(), 0x32caab7b40c72493uL.toLong(),
        0x3c9ebe0a15c9bebcuL.toLong(), 0x431d67c49c100d4cuL.toLong(),
        0x4cc5d4becb3e42b6uL.toLong(), 0x597f299cfc657e2auL.toLong(),
        0x5fcb6fab3ad6faecuL.toLong(), 0x6c44198c4a475817uL.toLong()
    )
}
