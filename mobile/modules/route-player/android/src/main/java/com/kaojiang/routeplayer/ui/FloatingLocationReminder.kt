package com.kaojiang.routeplayer.ui

import android.content.Context
import android.os.Build
import android.view.ContextThemeWrapper
import android.view.WindowManager
import androidx.appcompat.app.AlertDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.kaojiang.routeplayer.R

/** An instruction, not a claim that another app or the GPS receiver has acquired a fix. */
internal object FloatingLocationReminder {
    @Suppress("DEPRECATION")
    fun create(context: Context): AlertDialog = MaterialAlertDialogBuilder(ContextThemeWrapper(context, R.style.Theme_RoutePlayer))
        .setTitle(R.string.floating_reminder_title)
        .setMessage(R.string.floating_reminder_body)
        .setPositiveButton(R.string.floating_reminder_ok, null)
        .setCancelable(false)
        .create().apply {
            setCanceledOnTouchOutside(false)
            window?.setType(if (Build.VERSION.SDK_INT >= 26)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE)
        }
}
