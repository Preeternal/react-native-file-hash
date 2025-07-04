package com.preeternal.filehash

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.NativeModule
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class FileHashPackage : TurboReactPackage() {
    
    // Этот метод вызывается для НОВОЙ архитектуры
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == "FileHash") {
            FileHashModule(reactContext)
        } else {
            null
        }
    }

    // Этот метод будет вызван для СТАРОЙ архитектуры
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(FileHashModuleLegacy(reactContext))
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            val moduleInfo = ReactModuleInfo(
                "FileHash",           // Имя модуля
                "com.preeternal.filehash.FileHashModule", // Имя класса
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