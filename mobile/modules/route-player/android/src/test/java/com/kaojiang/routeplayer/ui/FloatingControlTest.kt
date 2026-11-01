package com.kaojiang.routeplayer.ui

import android.app.Application
import android.os.Build
import android.os.Looper
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.WindowManager
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowSettings
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [24, 26, 34], application = Application::class, qualifiers = "w360dp-h800dp")
class FloatingControlTest {
    private lateinit var control: FloatingControl
    private var taps = 0
    private var closes = 0

    @Before fun create() {
        ShadowSettings.setCanDrawOverlays(true)
        control = FloatingControl(RuntimeEnvironment.getApplication(), { taps++ }, { closes++ })
    }

    @After fun cleanup() { control.hide() }

    private fun touch(action: Int, x: Float, y: Float) {
        val event = MotionEvent.obtain(0, 0, action, x, y, 0)
        control.button!!.dispatchTouchEvent(event)
        event.recycle()
    }

    @Test fun missingPermissionCannotAddAWindow() {
        ShadowSettings.setCanDrawOverlays(false)
        assertFalse(control.show())
        assertFalse(control.isVisible)
        assertNull(control.button)
    }

    @Suppress("DEPRECATION")
    @Test fun usesOneAccessibleControlAndTheSupportedWindowType() {
        assertTrue(control.show())
        val original = control.button
        assertTrue(control.show())
        assertSame(original, control.button)
        assertEquals("开始", control.button!!.text.toString())
        assertEquals(if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else WindowManager.LayoutParams.TYPE_PHONE, control.parameters!!.type)
        assertTrue(control.parameters!!.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE != 0)
        assertTrue(control.button!!.contentDescription.contains("长按"))
        control.hide()
        assertFalse(control.isVisible)
    }

    @Test fun updatesTheActionAndPercentWithoutCreatingAnotherButton() {
        assertTrue(control.show())
        val original = control.button
        control.render(true, 0)
        assertEquals("结束 · 0%", control.button!!.text.toString())
        control.render(true, 42)
        assertEquals("结束 · 42%", control.button!!.text.toString())
        control.render(true, 170)
        assertEquals("结束 · 100%", control.button!!.text.toString())
        control.render(false, 100)
        assertSame(original, control.button)
        assertEquals("开始", control.button!!.text.toString())
    }

    @Test fun draggingClampsPositionAndDoesNotActivateTheControl() {
        assertTrue(control.show())
        touch(MotionEvent.ACTION_DOWN, 40f, 40f)
        touch(MotionEvent.ACTION_MOVE, -10000f, -10000f)
        touch(MotionEvent.ACTION_UP, -10000f, -10000f)
        assertEquals(0, taps)
        assertEquals(0, closes)
        assertTrue(control.parameters!!.x >= 0)
        assertTrue(control.parameters!!.y >= 0)
        val x = control.parameters!!.x
        val y = control.parameters!!.y
        control.hide()
        assertTrue(control.show())
        assertEquals(x, control.parameters!!.x)
        assertEquals(y, control.parameters!!.y)
    }

    @Test fun smallTapRunsExactlyOneAction() {
        assertTrue(control.show())
        touch(MotionEvent.ACTION_DOWN, 40f, 40f)
        touch(MotionEvent.ACTION_UP, 41f, 40f)
        assertEquals(1, taps)
        assertEquals(0, closes)
    }

    @Test fun longPressClosesWithoutStartingOrEnding() {
        assertTrue(control.show())
        touch(MotionEvent.ACTION_DOWN, 40f, 40f)
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ViewConfiguration.getLongPressTimeout().toLong() + 50))
        touch(MotionEvent.ACTION_UP, 40f, 40f)
        assertEquals(1, closes)
        assertEquals(0, taps)
    }
}
