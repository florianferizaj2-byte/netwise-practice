package com.kaojiang.routeplayer.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.WindowManager
import androidx.appcompat.widget.AppCompatButton
import androidx.core.content.ContextCompat
import com.kaojiang.routeplayer.R
import kotlin.math.hypot

/** One draggable control; its window never takes keyboard focus from the other app. */
internal class FloatingControl(
    private val context: Context,
    private val onTap: () -> Unit,
    private val onClose: () -> Unit,
) {
    val overlayContext = OverlayWindowContext.create(context)
    private val manager = overlayContext.getSystemService(WindowManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    var button: AppCompatButton? = null
        private set
    var parameters: WindowManager.LayoutParams? = null
        private set
    val isVisible get() = button != null
    private var downX = 0f
    private var downY = 0f
    private var startX = 0
    private var startY = 0
    private var dragged = false
    private var longPressed = false
    private val longPress = Runnable {
        button?.takeIf { it.isPressed && !dragged }?.let {
            longPressed = true
            it.isPressed = false
            it.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            it.performLongClick()
        }
    }

    @Suppress("DEPRECATION")
    fun show(): Boolean {
        if (isVisible) return true
        if (!Settings.canDrawOverlays(context)) return false
        val control = AppCompatButton(ContextThemeWrapper(overlayContext, R.style.Theme_RoutePlayer)).apply {
            id = R.id.floatingControlButton
            minWidth = dp(112)
            minHeight = dp(56)
            maxWidth = availableSize().first - dp(16)
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
            isAllCaps = false
            setTextColor(ContextCompat.getColor(context, R.color.rp_on_primary))
            setPadding(dp(12), dp(10), dp(12), dp(10))
            maxLines = 2
            val fill = GradientDrawable().apply {
                cornerRadius = dp(28).toFloat()
                setColor(ContextCompat.getColor(context, R.color.rp_primary))
            }
            background = RippleDrawable(ColorStateList.valueOf(Color.argb(60, 255, 255, 255)), fill, null)
            elevation = dp(6).toFloat()
            setOnClickListener { onTap() }
            setOnLongClickListener { onClose(); true }
            setOnTouchListener { view, event -> handleTouch(view, event) }
        }
        val layout = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = FloatingControlPreferences.x(context).takeIf { it >= 0 } ?: dp(16)
            y = FloatingControlPreferences.y(context).takeIf { it >= 0 } ?: availableSize().second / 3
        }
        button = control
        parameters = layout
        render(running = false, progress = 0)
        return runCatching { manager.addView(control, layout); true }.getOrElse {
            button = null
            parameters = null
            false
        }
    }

    fun render(running: Boolean, progress: Int, pending: Boolean = false) {
        val control = button ?: return
        val text = if (running) context.getString(R.string.floating_end_percent, progress.coerceIn(0, 100))
            else context.getString(R.string.simple_start)
        if (control.text.toString() != text) control.text = text
        control.isEnabled = !pending
        control.contentDescription = context.getString(R.string.floating_accessibility, text)
        reposition()
    }

    fun reposition() {
        val control = button ?: return
        val layout = parameters ?: return
        val size = availableSize()
        control.maxWidth = (size.first - dp(16)).coerceAtLeast(dp(56))
        control.measure(View.MeasureSpec.makeMeasureSpec(control.maxWidth, View.MeasureSpec.AT_MOST),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
        layout.x = layout.x.coerceIn(dp(8), (size.first - control.measuredWidth - dp(8)).coerceAtLeast(dp(8)))
        layout.y = layout.y.coerceIn(dp(8), (size.second - control.measuredHeight - dp(8)).coerceAtLeast(dp(8)))
        if (control.isAttachedToWindow) runCatching { manager.updateViewLayout(control, layout) }
    }

    fun hide() {
        handler.removeCallbacksAndMessages(null)
        val control = button
        button = null
        parameters = null
        control?.let { runCatching { manager.removeViewImmediate(it) } }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun handleTouch(view: View, event: MotionEvent): Boolean {
        val layout = parameters ?: return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                if (!view.isEnabled) return false
                downX = event.rawX; downY = event.rawY
                startX = layout.x; startY = layout.y
                dragged = false; longPressed = false
                view.isPressed = true
                handler.postDelayed(longPress, ViewConfiguration.getLongPressTimeout().toLong())
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.rawX - downX; val dy = event.rawY - downY
                if (dragged || hypot(dx.toDouble(), dy.toDouble()) > slop) {
                    dragged = true
                    view.isPressed = false
                    handler.removeCallbacks(longPress)
                    layout.x = startX + dx.toInt(); layout.y = startY + dy.toInt()
                    reposition()
                }
            }
            MotionEvent.ACTION_UP -> {
                handler.removeCallbacks(longPress)
                view.isPressed = false
                if (dragged) FloatingControlPreferences.savePosition(context, layout.x, layout.y)
                else if (!longPressed && view.isEnabled) view.performClick()
            }
            MotionEvent.ACTION_CANCEL -> {
                handler.removeCallbacks(longPress)
                view.isPressed = false
            }
        }
        return true
    }

    @Suppress("DEPRECATION")
    private fun availableSize(): Pair<Int, Int> {
        if (Build.VERSION.SDK_INT >= 30) {
            val metrics = manager.currentWindowMetrics
            val insets = metrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            return (metrics.bounds.width() - insets.left - insets.right).coerceAtLeast(dp(80)) to
                (metrics.bounds.height() - insets.top - insets.bottom).coerceAtLeast(dp(80))
        }
        val metrics = overlayContext.resources.displayMetrics
        return metrics.widthPixels.coerceAtLeast(dp(80)) to metrics.heightPixels.coerceAtLeast(dp(80))
    }

    private fun dp(value: Int) = (value * overlayContext.resources.displayMetrics.density).toInt()
}
