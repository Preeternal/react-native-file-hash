package com.preeternal.filehash

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap

class FileHashPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == FileHashModule.NAME) {
            FileHashModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
            moduleInfos[FileHashModule.NAME] = ReactModuleInfo(
                FileHashModule.NAME,
                FileHashModule.NAME,
                canOverrideExistingModule = false,  // canOverrideExistingModule
                needsEagerInit = false,  // needsEagerInit
                isCxxModule = false,  // isCxxModule
                isTurboModule = true // isTurboModule
            )
            moduleInfos
        }
    }
}