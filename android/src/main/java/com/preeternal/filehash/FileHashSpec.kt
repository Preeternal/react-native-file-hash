package com.preeternal.filehash

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.turbomodule.core.interfaces.TurboModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.NativeModule

interface FileHashSpec : NativeModule, TurboModule {
    fun getFileSha256(filePath: String, promise: Promise)
    fun md5Hash(filePath: String, promise: Promise)
}