package com.kaojiang.runtime

import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import expo.modules.kotlin.functions.Queues

class AppRuntimeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AceExamAppRuntime")
    Constants {
      val context = appContext.reactContext ?: error("Application unavailable")
      val info = context.packageManager.getPackageInfo(context.packageName, 0)
      mapOf("installedVersion" to info.versionName, "installedBuild" to
        (if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()).toString())
    }
    AsyncFunction("sha256File") { uri: String ->
      val context = appContext.reactContext ?: error("Application unavailable")
      val parsed = Uri.parse(uri)
      require(parsed.scheme == "file") { "Only local audio files may be verified" }
      LocalAudioVerifier.sha256(File(parsed.path ?: error("Missing file")), listOf(context.filesDir, context.cacheDir))
    }.runOnQueue(Queues.DEFAULT)
  }
}
