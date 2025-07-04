package com.preeternal.filehash

import com.facebook.react.bridge.Promise
import com.facebook.react.turbomodule.core.interfaces.TurboModule

interface FileHashSpec : TurboModule {
    fun getFileSha256(filePath: String, promise: Promise)
    fun md5Hash(filePath: String, promise: Promise)
}