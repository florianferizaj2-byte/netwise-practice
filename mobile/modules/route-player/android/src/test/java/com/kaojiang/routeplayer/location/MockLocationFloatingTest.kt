package com.kaojiang.routeplayer.location

import android.Manifest
import android.app.AppOpsManager
import android.app.Application
import android.content.DialogInterface
import android.location.LocationManager
import android.os.Looper
import android.os.Process
import androidx.appcompat.app.AlertDialog
import com.kaojiang.routeplayer.routes.FixedRouteLoader
import com.kaojiang.routeplayer.routes.GeoMath
import com.kaojiang.routeplayer.R
import com.kaojiang.routeplayer.ui.LearningConsent
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ServiceController
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowDialog
import org.robolectric.shadows.ShadowSettings
import java.time.Duration

/** Lifecycle and controls on the local Android runtime; no claim of physical GPS validation. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class, qualifiers = "w360dp-h800dp")
class MockLocationFloatingTest {
    private lateinit var controller: ServiceController<MockLocationService>
    private lateinit var service: MockLocationService
    private lateinit var token: String

    @Before fun create() {
        controller = Robolectric.buildService(MockLocationService::class.java).create()
        service = controller.get()
        shadowOf(service.application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        shadowOf(service.getSystemService(AppOpsManager::class.java)).setMode(AppOpsManager.OPSTR_MOCK_LOCATION, Process.myUid(), service.packageName, AppOpsManager.MODE_ALLOWED)
        shadowOf(service.getSystemService(LocationManager::class.java)).setLocationEnabled(true)
        ShadowSettings.setCanDrawOverlays(true)
        token = LearningConsent.issue()
    }

    @After fun cleanup() { controller.destroy() }

    private fun openFloating(acknowledgeReminder: Boolean = true) {
        service.onStartCommand(MockLocationService.showOverlayIntent(service, token), 0, 1)
        if (acknowledgeReminder && dialog().isShowing) choose(DialogInterface.BUTTON_POSITIVE)
    }
    private fun dialog() = ShadowDialog.getLatestDialog() as AlertDialog
    private fun choose(button: Int) {
        dialog().getButton(button).performClick()
        shadowOf(Looper.getMainLooper()).idle()
    }
    private fun startViaFloating() {
        openFloating()
        service.floatingControl.button!!.performClick()
        choose(DialogInterface.BUTTON_POSITIVE)
    }

    @Test fun openingIsIdleAndDoesNotInjectOrStartTheRoute() {
        openFloating()
        assertTrue(service.floatingControl.isVisible)
        assertEquals("开始", service.floatingControl.button!!.text.toString())
        assertFalse(MockLocationPreferences.isActive(service))
        assertFalse(shadowOf(service).isStoppedBySelf)
        assertNotNull(shadowOf(service).lastForegroundNotification)
    }

    @Test fun openingShowsLocationReminderAndAcknowledgingNeverStartsLocation() {
        openFloating(acknowledgeReminder = false)
        assertTrue(dialog().isShowing)
        assertEquals(service.getString(R.string.floating_reminder_body), dialog().findViewById<android.widget.TextView>(android.R.id.message)!!.text.toString())
        assertFalse(service.floatingControl.button!!.isEnabled)
        assertFalse(MockLocationPreferences.isActive(service))
        service.floatingControl.button!!.performClick()
        assertFalse(MockLocationPreferences.isActive(service))
        choose(DialogInterface.BUTTON_POSITIVE)
        assertFalse(MockLocationPreferences.isActive(service))
        assertTrue(service.floatingControl.button!!.isEnabled)
        service.floatingControl.button!!.performClick()
        assertTrue(dialog().isShowing)
        assertFalse(MockLocationPreferences.isActive(service))
        choose(DialogInterface.BUTTON_POSITIVE)
        assertTrue(MockLocationPreferences.isActive(service))
    }

    @Test fun repeatedShowKeepsOneReminderAndClosingThenReopeningShowsItAgain() {
        openFloating(acknowledgeReminder = false)
        val first = dialog()
        service.onStartCommand(MockLocationService.showOverlayIntent(service, token), 0, 2)
        assertSame(first, dialog())
        assertFalse(service.floatingControl.button!!.isEnabled)
        service.onStartCommand(MockLocationService.hideOverlayIntent(service), 0, 3)
        assertFalse(first.isShowing)
        assertFalse(service.floatingControl.isVisible)
        openFloating(acknowledgeReminder = false)
        assertNotSame(first, dialog())
        assertTrue(dialog().isShowing)
        assertFalse(MockLocationPreferences.isActive(service))
    }

    @Test fun floatingStartAlwaysRequiresExplicitConsent() {
        openFloating()
        service.floatingControl.button!!.performClick()
        assertTrue(dialog().isShowing)
        assertFalse(MockLocationPreferences.isActive(service))
        assertFalse(service.floatingControl.button!!.isEnabled)
        choose(DialogInterface.BUTTON_NEGATIVE)
        assertFalse(MockLocationPreferences.isActive(service))
        assertEquals("开始", service.floatingControl.button!!.text.toString())
        assertTrue(service.floatingControl.button!!.isEnabled)
    }

    @Test fun endStopsLocationButKeepsTheFloatingControlReadyToRestart() {
        startViaFloating()
        assertTrue(MockLocationPreferences.isActive(service))
        assertEquals("结束 · 0%", service.floatingControl.button!!.text.toString())
        service.floatingControl.button!!.performClick()
        assertFalse(MockLocationPreferences.isActive(service))
        assertTrue(service.floatingControl.isVisible)
        assertEquals("开始", service.floatingControl.button!!.text.toString())
        assertFalse(shadowOf(service).isStoppedBySelf)
        service.floatingControl.button!!.performClick()
        assertTrue(dialog().isShowing)
        assertFalse(MockLocationPreferences.isActive(service))
        choose(DialogInterface.BUTTON_POSITIVE)
        assertTrue(MockLocationPreferences.isActive(service))
        assertEquals("结束 · 0%", service.floatingControl.button!!.text.toString())
    }

    @Test fun idleStatusQueryDoesNotRemoveTheFloatingWindow() {
        openFloating()
        service.onStartCommand(MockLocationService.queryIntent(service), 0, 2)
        assertTrue(service.floatingControl.isVisible)
        assertFalse(shadowOf(service).isStoppedBySelf)
    }

    @Test fun progressAdvancesAndIsIncludedInStatusBroadcasts() {
        startViaFloating()
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(120))
        val percent = MockLocationPreferences.progress(service)
        assertTrue(percent in 1..99)
        assertEquals("结束 · $percent%", service.floatingControl.button!!.text.toString())
        val status = shadowOf(service.application).broadcastIntents.last { it.action == MockLocationService.ACTION_STATUS }
        assertEquals(percent, status.getIntExtra(MockLocationService.EXTRA_PROGRESS, -1))
    }

    @Test fun naturalCompletionShows100AndLeavesStartAvailable() {
        startViaFloating()
        val route = FixedRouteLoader.load(service)
        val distance = route.waypoints.zipWithNext().sumOf { (a, b) -> GeoMath.distanceMeters(a.coordinates, b.coordinates) }
        val seconds = (distance / (route.speedKph / 3.6)).toLong() + 5
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(seconds))
        assertFalse(MockLocationPreferences.isActive(service))
        assertEquals(100, MockLocationPreferences.progress(service))
        assertEquals("开始", service.floatingControl.button!!.text.toString())
        assertFalse(shadowOf(service).isStoppedBySelf)
        val completed = shadowOf(service.application).broadcastIntents.last { it.getStringExtra(MockLocationService.EXTRA_STATUS) == MockLocationService.STATUS_ROUTE_COMPLETED }
        assertEquals(100, completed.getIntExtra(MockLocationService.EXTRA_PROGRESS, -1))
    }

    @Test fun closingTheWindowDuringARunPreservesTheRun() {
        startViaFloating()
        service.floatingControl.button!!.performLongClick()
        assertFalse(service.floatingControl.isVisible)
        assertFalse(MockLocationPreferences.isOverlayActive(service))
        assertTrue(MockLocationPreferences.isActive(service))
        assertFalse(shadowOf(service).isStoppedBySelf)
        service.onStartCommand(MockLocationService.stopIntent(service), 0, 2)
        assertFalse(MockLocationPreferences.isActive(service))
        assertTrue(shadowOf(service).isStoppedBySelf)
    }

    @Test fun closingAnIdleWindowStopsTheForegroundSession() {
        openFloating()
        service.floatingControl.button!!.performLongClick()
        assertFalse(service.floatingControl.isVisible)
        assertTrue(shadowOf(service).isStoppedBySelf)
    }

    @Test fun missingConsentOrOverlayPermissionCannotOpenTheWindow() {
        service.onStartCommand(MockLocationService.showOverlayIntent(service, null), 0, 1)
        assertFalse(service.floatingControl.isVisible)
        assertFalse(MockLocationPreferences.isActive(service))
        ShadowSettings.setCanDrawOverlays(false)
        service.onStartCommand(MockLocationService.showOverlayIntent(service, token), 0, 2)
        assertFalse(service.floatingControl.isVisible)
        assertFalse(MockLocationPreferences.isActive(service))
    }

    @Test fun normalStartAndEndWithoutFloatingStillStopTheService() {
        service.onStartCommand(MockLocationService.startFixedRouteIntent(service, token), 0, 1)
        assertTrue(MockLocationPreferences.isActive(service))
        assertFalse(service.floatingControl.isVisible)
        service.onStartCommand(MockLocationService.stopIntent(service), 0, 2)
        assertFalse(MockLocationPreferences.isActive(service))
        assertTrue(shadowOf(service).isStoppedBySelf)
    }
}
