package com.preeternal.filehash

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

abstract class FileHashSpec(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    abstract fun getFileSha256(filePath: String, promise: Promise)
    abstract fun md5Hash(filePath: String, promise: Promise)
}