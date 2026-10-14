package com.kaojiang.routeplayer.routes

import android.app.Application
import android.content.DialogInterface
import android.content.Intent
import android.os.Bundle
import android.os.Looper
import android.widget.TextView
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
import com.kaojiang.routeplayer.location.MockLocationService
import com.kaojiang.routeplayer.location.MockLocationPreferences

/** Exercise the real Android screen; GPS and device power management remain device tests. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class RoutePlayerDisclaimerTest {
    private val controllers = mutableListOf<ActivityController<RoutePlayerActivity>>()

    @After fun cleanup() {
        controllers.forEach { it.pause().stop().destroy() }
        controllers.clear()
    }

    private fun open(state: Bundle? = null): ActivityController<RoutePlayerActivity> {
        val controller = Robolectric.buildActivity(RoutePlayerActivity::class.java)
        controllers += controller
        controller.create(state).start().resume().visible()
        shadowOf(Looper.getMainLooper()).idle()
        return controller
    }

    private fun dialog(): AlertDialog = ShadowDialog.getLatestDialog() as AlertDialog
    private fun start(activity: RoutePlayerActivity) = activity.findViewById<MaterialButton>(R.id.playPauseButton)

    private fun accept() {
        dialog().getButton(DialogInterface.BUTTON_POSITIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
    }

    private fun assertNoSimulationStarted(activity: RoutePlayerActivity) {
        val application = shadowOf(activity.application)
        while (true) {
            val intent = application.nextStartedService ?: break
            assertNotEquals("com.kaojiang.routeplayer.START", intent.action)
        }
    }

    @Test fun enteringShowsTermsAndBlocksStartUntilAccepted() {
        val activity = open().get()
        assertTrue(dialog().isShowing)
        val terms = dialog().findViewById<TextView>(android.R.id.message)!!.text.toString()
        assertTrue(terms.contains("仅供学习"))
        assertTrue(terms.contains("严禁用于校园跑作弊"))
        assertFalse(start(activity).isEnabled)
        // Even a direct click callback cannot bypass acceptance.
        start(activity).performClick()
        assertNoSimulationStarted(activity)
    }

    @Test fun disagreeReturnsWithoutStarting() {
        val activity = open().get()
        dialog().getButton(DialogInterface.BUTTON_NEGATIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(activity.isFinishing)
        assertNoSimulationStarted(activity)
    }

    @Test fun agreeEnablesStartButDoesNotAutomaticallyStart() {
        val activity = open().get()
        accept()
        assertFalse(dialog().isShowing)
        assertTrue(start(activity).isEnabled)
        assertEquals("开始", start(activity).text.toString())
        assertEquals("结束", activity.findViewById<MaterialButton>(R.id.playerStopButton).text.toString())
        assertNoSimulationStarted(activity)
    }

    @Test fun reopeningRequiresAcceptanceAgain() {
        val first = open()
        accept()
        first.pause().stop().destroy()
        controllers.remove(first)
        val second = open().get()
        assertTrue(dialog().isShowing)
        assertFalse(start(second).isEnabled)
        assertNoSimulationStarted(second)
    }

    @Test fun recreationRetainsAcceptanceWithinTheSameVisit() {
        val first = open()
        accept()
        val state = Bundle()
        first.saveInstanceState(state).pause().stop().destroy()
        controllers.remove(first)
        val restored = open(state).get()
        assertFalse(dialog().isShowing)
        assertTrue(start(restored).isEnabled)
        assertNoSimulationStarted(restored)
    }

    @Test fun reusedActivityEntryShowsTermsAgain() {
        val controller = open()
        accept()
        controller.newIntent(Intent(controller.get(), RoutePlayerActivity::class.java))
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(dialog().isShowing)
        assertFalse(start(controller.get()).isEnabled)
        assertNoSimulationStarted(controller.get())
    }

    @Test fun acceptanceFromAnEarlierProcessCannotBypassTerms() {
        val first = open()
        accept()
        val state = Bundle()
        first.saveInstanceState(state).pause().stop().destroy()
        controllers.remove(first)
        state.putString("disclaimerProcess", "earlier-process")
        val restored = open(state).get()
        assertTrue(dialog().isShowing)
        assertFalse(start(restored).isEnabled)
        assertNoSimulationStarted(restored)
    }

    @Test fun theHomeShowsPercentageUpdatesAndFinalCompletion() {
        val activity = open().get()
        accept()
        val application = activity.application
        fun status(state: String, percentage: Int) {
            application.sendBroadcast(Intent(MockLocationService.ACTION_STATUS).setPackage(application.packageName)
                .putExtra(MockLocationService.EXTRA_STATUS, state)
                .putExtra(MockLocationService.EXTRA_PROGRESS, percentage))
            shadowOf(Looper.getMainLooper()).idle()
        }
        status(MockLocationService.STATUS_ROUTE_RUNNING, 0)
        assertEquals("运行中 · 0%", activity.findViewById<TextView>(R.id.playerStatus).text.toString())
        status(MockLocationService.STATUS_ROUTE_RUNNING, 45)
        assertEquals("运行中 · 45%", activity.findViewById<TextView>(R.id.playerStatus).text.toString())
        status(MockLocationService.STATUS_ROUTE_COMPLETED, 100)
        assertEquals("已结束 · 100%", activity.findViewById<TextView>(R.id.playerStatus).text.toString())
        assertTrue(start(activity).isEnabled)
    }
}
