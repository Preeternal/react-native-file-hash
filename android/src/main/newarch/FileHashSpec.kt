package com.preeternal.filehash

import com.facebook.react.bridge.Promise
import com.facebook.react.turbomodule.core.interfaces.TurboModule

interface FileHashSpec : TurboModule {
    fun fileHash(filePath: String, algorithm: String, promise: Promise)
}