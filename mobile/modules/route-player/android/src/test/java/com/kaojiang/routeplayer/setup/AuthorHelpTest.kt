package com.kaojiang.routeplayer.setup

import android.app.Application
import android.content.DialogInterface
import android.os.Looper
import android.widget.ImageView
import androidx.appcompat.app.AlertDialog
import com.google.android.material.button.MaterialButton
import com.kaojiang.routeplayer.R
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowDialog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class AuthorHelpTest {
    private var controller: ActivityController<SetupActivity>? = null
    @After fun cleanup() { controller?.pause()?.stop()?.destroy() }
    private fun open() = Robolectric.buildActivity(SetupActivity::class.java).setup().also { controller = it }.get()

    @Test fun helpShowsTheSuppliedQrWithoutStartingLocationOrOpeningAnotherApp() {
        val activity = open()
        val button = activity.findViewById<MaterialButton>(R.id.authorHelpButton)
        assertEquals("求助作者", button.text.toString())
        button.performClick()
        val dialog = ShadowDialog.getLatestDialog() as AlertDialog
        assertTrue(dialog.isShowing)
        val code = dialog.findViewById<ImageView>(R.id.authorFriendCode)!!
        assertNotNull(code.drawable)
        assertEquals("作者微信好友二维码", code.contentDescription)
        assertNull(shadowOf(activity).nextStartedActivity)
        assertNull(shadowOf(activity.application).nextStartedService)
        dialog.getButton(DialogInterface.BUTTON_POSITIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
        assertFalse(dialog.isShowing)
        assertFalse(activity.isFinishing)
        button.performClick()
        assertTrue(ShadowDialog.getLatestDialog().isShowing)
    }

    @Test fun leavingTutorialClosesTheQrDialog() {
        val activity = open()
        activity.findViewById<MaterialButton>(R.id.authorHelpButton).performClick()
        val dialog = ShadowDialog.getLatestDialog()
        controller!!.pause().stop().destroy(); controller = null
        assertFalse(dialog.isShowing)
    }
}
