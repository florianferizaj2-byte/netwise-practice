package com.kaojiang.routeplayer.ui

import android.content.Context
import android.os.Build
import android.view.ContextThemeWrapper
import android.view.WindowManager
import androidx.appcompat.app.AlertDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.kaojiang.routeplayer.R

internal object UsageDisclaimer {
    @Suppress("DEPRECATION")
    fun create(context: Context, overlay: Boolean = false, onAccept: () -> Unit, onDecline: () -> Unit): AlertDialog {
        val themed = if (overlay) ContextThemeWrapper(context, R.style.Theme_RoutePlayer) else context
        return MaterialAlertDialogBuilder(themed)
            .setTitle(R.string.route_disclaimer_title)
            .setMessage(R.string.route_disclaimer_body)
            .setNegativeButton(R.string.route_disclaimer_decline) { _, _ -> onDecline() }
            .setPositiveButton(R.string.route_disclaimer_accept) { _, _ -> onAccept() }
            .setCancelable(false)
            .create().apply {
                setCanceledOnTouchOutside(false)
                if (overlay) window?.setType(if (Build.VERSION.SDK_INT >= 26)
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE)
            }
    }
}
