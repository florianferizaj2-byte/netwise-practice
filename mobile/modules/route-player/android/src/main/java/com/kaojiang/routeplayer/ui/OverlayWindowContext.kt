package com.kaojiang.routeplayer.ui

import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Build
import android.view.Display
import android.view.WindowManager

internal object OverlayWindowContext {
    fun create(context: Context): Context {
        if (Build.VERSION.SDK_INT < 30) return context
        val display = checkNotNull(context.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY))
        return context.createDisplayContext(display).createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
    }
}
