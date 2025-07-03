package com.preeternal.hash.utils

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.turbomodule.core.interfaces.TurboModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.NativeModule

interface HashUtilsSpec : NativeModule, TurboModule {
    fun getFileSha256(filePath: String, promise: Promise)
    fun md5Hash(filePath: String, promise: Promise)
}