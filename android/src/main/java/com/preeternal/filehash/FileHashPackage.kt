package com.preeternal.filehash

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.NativeModule
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class FileHashPackage : TurboReactPackage() {
    
    // new arch
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == "FileHash") {
            FileHashModule(reactContext)
        } else {
            null
        }
    }

    // old arch
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(FileHashModule(reactContext))
    }

    // new arch
    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            val moduleInfo = ReactModuleInfo(
                "FileHash",           // module name
                "com.preeternal.filehash.FileHashModule", // class name
                false,                 // canOverrideExistingModule
                false,                 // needsEagerInit
                true,                  // hasConstants
                false,                 // isCxxModule
                true                   // isTurboModule
            )
            mapOf("FileHash" to moduleInfo)
        }
    }
}