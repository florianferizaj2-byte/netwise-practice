package com.kaojiang.routeplayer.setup

import android.Manifest
import android.app.Application
import android.content.Intent
import android.provider.Settings
import com.google.android.material.materialswitch.MaterialSwitch
import com.kaojiang.routeplayer.R
import com.kaojiang.routeplayer.location.MockLocationPreferences
import com.kaojiang.routeplayer.ui.FloatingControlPreferences
import com.kaojiang.routeplayer.ui.LearningConsent
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowSettings

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class FloatingSetupTest {
    private var controller: ActivityController<SetupActivity>? = null

    @After fun cleanup() { controller?.pause()?.stop()?.destroy() }

    private fun open(approved: Boolean = true): SetupActivity {
        val application: Application = RuntimeEnvironment.getApplication()
        shadowOf(application).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        val intent = Intent(application, SetupActivity::class.java)
        if (approved) intent.putExtra(LearningConsent.EXTRA_TOKEN, LearningConsent.issue())
        controller = Robolectric.buildActivity(SetupActivity::class.java, intent).setup()
        return controller!!.get()
    }

    @Test fun switchOpensTheIdleFloatingSessionWithoutStartingLocation() {
        ShadowSettings.setCanDrawOverlays(true)
        val activity = open()
        activity.findViewById<MaterialSwitch>(R.id.floatingSwitch).isChecked = true
        val intent = shadowOf(activity.application).nextStartedService
        assertEquals("com.kaojiang.routeplayer.SHOW_OVERLAY", intent.action)
        assertTrue(LearningConsent.accepts(intent))
        assertFalse(MockLocationPreferences.isActive(activity))
    }

    @Test fun missingPermissionOpensTheSystemOverlayPermissionPage() {
        ShadowSettings.setCanDrawOverlays(false)
        val activity = open()
        activity.findViewById<MaterialSwitch>(R.id.floatingSwitch).isChecked = true
        val intent = shadowOf(activity).nextStartedActivity
        assertEquals(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, intent.action)
        assertEquals("package:" + activity.packageName, intent.data.toString())
        assertNull(shadowOf(activity.application).nextStartedService)
        ShadowSettings.setCanDrawOverlays(true)
        controller!!.pause().stop().start().resume()
        assertEquals("com.kaojiang.routeplayer.SHOW_OVERLAY", shadowOf(activity.application).nextStartedService.action)
    }

    @Test fun aTutorialWithoutAcceptedTermsCannotEnableTheFloatingWindow() {
        ShadowSettings.setCanDrawOverlays(true)
        val activity = open(approved = false)
        activity.findViewById<MaterialSwitch>(R.id.floatingSwitch).isChecked = true
        assertNull(shadowOf(activity.application).nextStartedService)
        assertFalse(activity.findViewById<MaterialSwitch>(R.id.floatingSwitch).isChecked)
    }

    @Test fun disablingTheSwitchHidesTheWindowWithoutEndingARunningRoute() {
        ShadowSettings.setCanDrawOverlays(true)
        val application: Application = RuntimeEnvironment.getApplication()
        FloatingControlPreferences.setEnabled(application, true)
        MockLocationPreferences.setOverlayActive(application, true)
        val activity = open()
        assertTrue(activity.findViewById<MaterialSwitch>(R.id.floatingSwitch).isChecked)
        activity.findViewById<MaterialSwitch>(R.id.floatingSwitch).isChecked = false
        assertEquals("com.kaojiang.routeplayer.HIDE_OVERLAY", shadowOf(activity.application).nextStartedService.action)
        assertFalse(FloatingControlPreferences.isEnabled(activity))
    }
}
