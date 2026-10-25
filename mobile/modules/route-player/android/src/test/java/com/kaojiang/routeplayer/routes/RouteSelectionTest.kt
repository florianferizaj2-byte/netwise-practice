package com.kaojiang.routeplayer.routes

import android.app.Application
import android.content.DialogInterface
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.os.Looper
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.google.android.material.button.MaterialButton
import com.kaojiang.routeplayer.R
import com.kaojiang.routeplayer.location.MockLocationPreferences
import com.kaojiang.routeplayer.location.MockLocationService
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
import org.robolectric.shadows.ShadowDialog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class, qualifiers = "w360dp-h800dp")
class RouteSelectionTest {
    private val controllers = mutableListOf<ActivityController<RoutePlayerActivity>>()
    @After fun cleanup() { controllers.forEach { it.pause().stop().destroy() } }

    private fun open(state: Bundle? = null): ActivityController<RoutePlayerActivity> {
        com.kaojiang.routeplayer.allowStudyFixture()
        val controller = Robolectric.buildActivity(RoutePlayerActivity::class.java)
        controllers += controller
        controller.create(state).start().resume().visible()
        shadowOf(Looper.getMainLooper()).idle()
        return controller
    }
    private fun dialog() = ShadowDialog.getLatestDialog() as AlertDialog
    private fun accept() {
        dialog().getButton(DialogInterface.BUTTON_POSITIVE).performClick()
        shadowOf(Looper.getMainLooper()).idle()
    }
    private fun selector(activity: RoutePlayerActivity) = activity.findViewById<MaterialButton>(R.id.routeSelector)
    private fun select(activity: RoutePlayerActivity, index: Int) {
        selector(activity).performClick()
        val list = dialog().listView
        list.performItemClick(list.getChildAt(index), index, list.adapter.getItemId(index))
        shadowOf(Looper.getMainLooper()).idle()
    }

    @Test fun choiceRequiresConsentAndListsThreeRoutesWithoutStartingTheService() {
        val activity = open().get()
        assertFalse(selector(activity).isEnabled)
        accept()
        assertEquals("路线：瞎JB乱跑", selector(activity).text.toString())
        selector(activity).performClick()
        val list = dialog().listView
        assertEquals(listOf("瞎JB乱跑", "操场循环跑", "爱心"), (0 until list.adapter.count).map { list.adapter.getItem(it).toString() })
        assertEquals(0, list.checkedItemPosition)
        dialog().getButton(DialogInterface.BUTTON_NEGATIVE).performClick()
        assertEquals(BuiltInRoutes.default.id, BuiltInRouteStore(activity).selected().id)
        while (true) {
            val intent = shadowOf(activity.application).nextStartedService ?: break
            assertNotEquals("com.kaojiang.routeplayer.START", intent.action)
        }
    }

    @Test fun selectedRoutePersistsAfterReopeningAndScreenRecreation() {
        val first = open()
        accept()
        select(first.get(), 1)
        assertEquals("路线：操场循环跑", selector(first.get()).text.toString())
        assertTrue(first.get().findViewById<TextView>(R.id.routeDetails).text.toString().startsWith("20 km/h"))
        val state = Bundle()
        first.saveInstanceState(state).pause().stop().destroy()
        controllers.remove(first)
        val rotated = open(state)
        assertEquals("路线：操场循环跑", selector(rotated.get()).text.toString())
        assertTrue(selector(rotated.get()).isEnabled)
        rotated.pause().stop().destroy()
        controllers.remove(rotated)
        val reopened = open().get()
        assertFalse(selector(reopened).isEnabled)
        accept()
        selector(reopened).performClick()
        assertEquals(1, dialog().listView.checkedItemPosition)
    }

    @Test fun activeRunShowsItsOwnRouteAndBlocksSelectionUntilStopped() {
        val activity = open().get()
        accept()
        select(activity, 1)
        selector(activity).performClick()
        val chooser = dialog()
        MockLocationPreferences.setRouteActive(activity, BuiltInRoutes.entries[2].id)
        fun status(value: String) {
            activity.sendBroadcast(Intent(MockLocationService.ACTION_STATUS).setPackage(activity.packageName)
                .putExtra(MockLocationService.EXTRA_STATUS, value).putExtra(MockLocationService.EXTRA_PROGRESS, 50))
            shadowOf(Looper.getMainLooper()).idle()
        }
        status(MockLocationService.STATUS_ROUTE_RUNNING)
        assertFalse(chooser.isShowing)
        assertFalse(selector(activity).isEnabled)
        assertEquals("路线：爱心", selector(activity).text.toString())
        MockLocationPreferences.setActive(activity, false)
        status(MockLocationService.STATUS_STOPPED)
        assertTrue(selector(activity).isEnabled)
        assertEquals("路线：操场循环跑", selector(activity).text.toString())
    }

    @Test fun unknownSavedIdFallsBackButAnExplicitInvalidSelectionIsRejected() {
        val activity = open().get()
        val store = BuiltInRouteStore(activity)
        activity.getSharedPreferences("kaojiang_route_player_routes", 0).edit().putString("selected", "missing-route").commit()
        assertEquals(BuiltInRoutes.default.id, store.selected().id)
        assertThrows(IllegalArgumentException::class.java) { store.select("../heart-route.rplroute.json") }
        assertEquals(BuiltInRoutes.default.id, store.selected().id)
    }

    @Test @Config(qualifiers = "w375dp-h812dp")
    fun routeChoiceFitsOnASmallPhone() { assertChoiceLayout(fontScale = 1f) }

    @Test @Config(qualifiers = "w800dp-h375dp")
    fun largeTextRemainsReadableInLandscape() { assertChoiceLayout(fontScale = 2f) }

    @Suppress("DEPRECATION")
    private fun assertChoiceLayout(fontScale: Float) {
        val application = RuntimeEnvironment.getApplication()
        val resources = application.resources
        val configuration = Configuration(resources.configuration).apply { this.fontScale = fontScale }
        resources.updateConfiguration(configuration, resources.displayMetrics)
        val activity = open().get()
        accept()
        select(activity, 1)
        val root = activity.findViewById<View>(android.R.id.content)
        val width = resources.displayMetrics.widthPixels
        val height = resources.displayMetrics.heightPixels
        root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
        root.layout(0, 0, width, height)
        val choice = selector(activity)
        assertTrue(choice.width <= width)
        assertTrue(choice.height >= 48 * resources.displayMetrics.density)
        assertNotNull(choice.layout)
        for (line in 0 until choice.layout.lineCount) assertEquals(0, choice.layout.getEllipsisCount(line))
        assertTrue(choice.height >= choice.layout.height + choice.compoundPaddingTop + choice.compoundPaddingBottom)
        choice.performClick()
        assertEquals(3, dialog().listView.adapter.count)
    }
}
