package com.preeternal.filehash

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class FileHashPackage : TurboReactPackage() {
    
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == "FileHash") {
            FileHashModule(reactContext)
        } else {
            null
        }
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            val moduleInfo = ReactModuleInfo(
                "FileHash",           // Имя модуля (должно совпадать с JS частью)
                "FileHash",           // Имя класса, можно то же
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