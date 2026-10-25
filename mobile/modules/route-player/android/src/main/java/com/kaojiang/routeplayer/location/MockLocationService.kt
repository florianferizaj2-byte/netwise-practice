package com.kaojiang.routeplayer.location

import com.kaojiang.routeplayer.LearningGateAccess

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.location.Location
import android.location.LocationManager
import android.location.provider.ProviderProperties
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.app.NotificationCompat
import com.kaojiang.routeplayer.R
import com.kaojiang.routeplayer.routes.BuiltInRouteStore
import com.kaojiang.routeplayer.routes.RoutePlayerActivity
import com.kaojiang.routeplayer.routes.RoutePosition
import com.kaojiang.routeplayer.routes.RouteSimulator
import com.kaojiang.routeplayer.ui.FloatingControl
import com.kaojiang.routeplayer.ui.FloatingControlPreferences
import com.kaojiang.routeplayer.ui.FloatingLocationReminder
import com.kaojiang.routeplayer.ui.LearningConsent
import com.kaojiang.routeplayer.ui.UsageDisclaimer

/** One foreground location session also hosts the optional floating controls. */
class MockLocationService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var manager: LocationManager
    private val prepared = mutableSetOf<String>()
    private var simulator: RouteSimulator? = null
    private var lastUpdateNanos = 0L
    private var wakeLock: PowerManager.WakeLock? = null
    private var renewAt = 0L
    private var lastProgress = -1
    private var foreground = false
    private var floatingDialog: AlertDialog? = null
    private var floatingReminder: AlertDialog? = null
    internal val floatingControl by lazy {
        FloatingControl(this, onTap = {
            if (simulator != null) endRoute(STATUS_STOPPED) else showFloatingDisclaimer()
        }, onClose = { disableFloating() })
    }
    private val tick = object : Runnable {
        override fun run() {
            runCatching {
                val current = simulator ?: return
                acquireWakeLock()
                val now = SystemClock.elapsedRealtimeNanos()
                val position = current.advance((now - lastUpdateNanos).coerceAtLeast(0L) / 1e9)
                lastUpdateNanos = now
                inject(position)
                updateProgress(position)
                if (position.isComplete) {
                    endRoute(STATUS_ROUTE_COMPLETED)
                } else {
                    announce(STATUS_ROUTE_RUNNING)
                    handler.postDelayed(this, 1_000L)
                }
            }.onFailure { fail() }
        }
    }

    override fun onCreate() {
        super.onCreate()
        manager = getSystemService(LocationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.route_player_name), NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) }
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action !in listOf(ACTION_STOP, ACTION_HIDE_OVERLAY, ACTION_QUERY) && !LearningGateAccess.isAllowed()) {
            endRoute(STATUS_STOPPED)
            disableFloating()
            stopSelf()
            return START_NOT_STICKY
        }
        when (intent?.action) {
            ACTION_QUERY -> {
                if (simulator != null) announce(STATUS_ROUTE_RUNNING)
                else {
                    MockLocationPreferences.setActive(this, false)
                    announce(STATUS_STOPPED)
                    if (!floatingControl.isVisible) stopSelf()
                }
            }
            ACTION_STOP -> { dismissFloatingDialogs(); endRoute(STATUS_STOPPED) }
            ACTION_SHOW_OVERLAY -> {
                if (!LearningConsent.accepts(intent) || !hasPreciseLocation() || !Settings.canDrawOverlays(this)) {
                    toast(R.string.floating_failed)
                    if (simulator == null && !floatingControl.isVisible) stopSelf()
                } else runCatching {
                    ensureForeground(starting = false)
                    if (!activateFloating()) stopIfIdle()
                    else { announce(if (simulator == null) STATUS_STOPPED else STATUS_ROUTE_RUNNING); refreshControls() }
                }.onFailure { fail() }
            }
            ACTION_HIDE_OVERLAY -> disableFloating()
            ACTION_START -> {
                if (!LearningConsent.accepts(intent)) {
                    toast(R.string.floating_return_learning)
                    if (simulator == null) { announce(STATUS_ERROR); stopIfIdle() }
                    return START_NOT_STICKY
                }
                if (simulator != null) { announce(STATUS_ROUTE_RUNNING); return START_NOT_STICKY }
                runCatching {
                    check(hasPreciseLocation())
                    ensureForeground(starting = true)
                    if (FloatingControlPreferences.isEnabled(this)) activateFloating(showReminder = false)
                    startRoute(intent.getStringExtra(EXTRA_ROUTE_ID))
                }.onFailure { fail() }
            }
            else -> stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
    override fun onDestroy() {
        dismissFloatingDialogs()
        floatingControl.hide()
        MockLocationPreferences.setOverlayActive(this, false)
        clearRoute()
        announce(STATUS_STOPPED)
        stopForeground(STOP_FOREGROUND_REMOVE)
        foreground = false
        super.onDestroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        floatingControl.reposition()
    }

    private fun hasPreciseLocation() = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun ensureForeground(starting: Boolean) {
        if (foreground) return
        val content = notification(starting)
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, content, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        else startForeground(NOTIFICATION_ID, content)
        foreground = true
    }

    private fun startRoute(routeId: String? = null) {
        check(LearningGateAccess.isAllowed()) { "请先在考匠完成今天的专项学习" }
        if (simulator != null) return
        check(hasPreciseLocation())
        check(MockLocationAccess.isEnabled(this))
        check(LocationManagerCompat.isLocationEnabled(manager))
        val routes = BuiltInRouteStore(this)
        val route = routes.load(routeId ?: routes.selected().id)
        simulator = RouteSimulator(route)
        prepareProvider(LocationManager.GPS_PROVIDER, satellite = true)
        runCatching { prepareProvider(LocationManager.NETWORK_PROVIDER, network = true) }
        acquireWakeLock()
        inject(checkNotNull(simulator).current())
        lastUpdateNanos = SystemClock.elapsedRealtimeNanos()
        lastProgress = -1
        MockLocationPreferences.setRouteActive(this, route.id)
        updateProgress(checkNotNull(simulator).current())
        announce(STATUS_ROUTE_RUNNING)
        handler.removeCallbacks(tick)
        handler.postDelayed(tick, 1_000L)
    }

    private fun activateFloating(showReminder: Boolean = true): Boolean {
        val wasVisible = floatingControl.isVisible
        val displayed = floatingControl.show()
        MockLocationPreferences.setOverlayActive(this, displayed)
        if (!displayed) {
            FloatingControlPreferences.setEnabled(this, false)
            toast(R.string.floating_failed)
        } else {
            FloatingControlPreferences.setEnabled(this, true)
            refreshControls()
            if (showReminder && !wasVisible && simulator == null) showFloatingReminder()
        }
        return displayed
    }

    private fun disableFloating() {
        dismissFloatingDialogs()
        floatingControl.hide()
        FloatingControlPreferences.setEnabled(this, false)
        MockLocationPreferences.setOverlayActive(this, false)
        announce(if (simulator == null) STATUS_STOPPED else STATUS_ROUTE_RUNNING)
        refreshControls()
        stopIfIdle()
    }

    private fun showFloatingDisclaimer() {
        if (floatingDialog?.isShowing == true || floatingReminder?.isShowing == true) return
        if (!Settings.canDrawOverlays(this)) { disableFloating(); return }
        floatingControl.render(false, lastProgress.coerceAtLeast(0), pending = true)
        val dialog = UsageDisclaimer.create(floatingControl.overlayContext, overlay = true, onAccept = {
            LearningConsent.issue()
            // Reuse the foreground session created while the settings Activity was visible.
            if (!hasPreciseLocation() || !MockLocationAccess.isEnabled(this) || !LocationManagerCompat.isLocationEnabled(manager)) {
                toast(R.string.floating_return_learning)
                runCatching { startActivity(Intent(this, RoutePlayerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            } else runCatching { startRoute() }.onFailure { fail() }
        }, onDecline = {})
        floatingDialog = dialog
        dialog.setOnDismissListener {
            floatingDialog = null
            floatingControl.render(simulator != null, lastProgress.coerceAtLeast(0))
        }
        runCatching { dialog.show() }.onFailure {
            floatingDialog = null
            disableFloating()
            toast(R.string.floating_failed)
        }
    }

    private fun showFloatingReminder() {
        val dialog = FloatingLocationReminder.create(floatingControl.overlayContext)
        floatingReminder = dialog
        dialog.setOnDismissListener {
            floatingReminder = null
            refreshControls()
        }
        runCatching { dialog.show(); refreshControls() }.onFailure {
            floatingReminder = null
            disableFloating()
            toast(R.string.floating_failed)
        }
    }

    private fun dismissFloatingDialogs() {
        floatingReminder?.setOnDismissListener(null)
        floatingReminder?.dismiss()
        floatingReminder = null
        floatingDialog?.setOnDismissListener(null)
        floatingDialog?.dismiss()
        floatingDialog = null
    }

    private fun endRoute(status: String) {
        clearRoute()
        announce(status)
        refreshControls()
        stopIfIdle()
    }

    private fun stopIfIdle() {
        if (simulator == null && !floatingControl.isVisible) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            foreground = false
            stopSelf()
        }
    }

    @Suppress("DEPRECATION")
    @SuppressLint("InlinedApi")
    private fun prepareProvider(provider: String, satellite: Boolean = false, network: Boolean = false) {
        runCatching { manager.removeTestProvider(provider) }
        // These Java compile-time integers are inlined, including on Android 7–11.
        manager.addTestProvider(provider, network, satellite, false, false, true, true, true,
            ProviderProperties.POWER_USAGE_LOW, ProviderProperties.ACCURACY_FINE)
        prepared.add(provider)
        manager.setTestProviderEnabled(provider, true)
    }

    private fun inject(position: RoutePosition) {
        prepared.forEach { provider ->
            val location = Location(provider).apply {
                latitude = position.coordinates.latitude
                longitude = position.coordinates.longitude
                altitude = 0.0
                accuracy = 3f
                speed = position.speedMetersPerSecond
                bearing = position.bearingDegrees
                time = System.currentTimeMillis()
                elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                if (Build.VERSION.SDK_INT >= 26) { verticalAccuracyMeters = 3f; speedAccuracyMetersPerSecond = 0.1f; bearingAccuracyDegrees = 1f }
            }
            if (provider == LocationManager.GPS_PROVIDER) manager.setTestProviderLocation(provider, location)
            else runCatching { manager.setTestProviderLocation(provider, location) }
        }
        MockLocationPreferences.saveCoordinates(this, position.coordinates)
    }

    @Suppress("DEPRECATION")
    private fun clearRoute() {
        handler.removeCallbacks(tick)
        simulator = null
        prepared.forEach { provider ->
            runCatching { manager.setTestProviderEnabled(provider, false) }
            runCatching { manager.removeTestProvider(provider) }
        }
        prepared.clear()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        renewAt = 0
        MockLocationPreferences.setActive(this, false)
    }

    private fun fail() {
        clearRoute()
        announce(STATUS_ERROR)
        refreshControls()
        stopIfIdle()
    }

    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock() {
        val now = SystemClock.elapsedRealtime()
        if (wakeLock?.isHeld == true && now < renewAt) return
        if (wakeLock == null) wakeLock = getSystemService(PowerManager::class.java).newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK, "$packageName:route-player").apply { setReferenceCounted(false) }
        wakeLock?.acquire(600_000L)
        renewAt = now + 300_000L
    }

    private fun announce(status: String) {
        sendBroadcast(Intent(ACTION_STATUS).setPackage(packageName).putExtra(EXTRA_STATUS, status)
            .putExtra(EXTRA_PROGRESS, lastProgress.coerceAtLeast(0))
            .putExtra(EXTRA_MESSAGE, if (status == STATUS_ERROR) getString(R.string.simple_start_failed) else "")
            .putExtra(EXTRA_OVERLAY, floatingControl.isVisible))
    }

    private fun notification(starting: Boolean = false): Notification = NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(R.drawable.rp_ic_notification)
        .setContentTitle(getString(R.string.route_player_name))
        .setContentText(when {
            starting -> getString(R.string.simple_starting)
            simulator != null -> getString(R.string.simple_running_percent, lastProgress.coerceAtLeast(0))
            else -> getString(R.string.floating_idle_notification)
        })
        .setContentIntent(PendingIntent.getActivity(this, 0, Intent(this, RoutePlayerActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        .setOngoing(true).setOnlyAlertOnce(true).setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setPriority(NotificationCompat.PRIORITY_LOW).setProgress(if (simulator != null || starting) 100 else 0, lastProgress.coerceAtLeast(0), starting)
        .addAction(R.drawable.rp_ic_stop, getString(if (simulator != null || starting) R.string.simple_end else R.string.floating_close),
            PendingIntent.getService(this, if (simulator != null || starting) 1 else 2,
                if (simulator != null || starting) stopIntent(this) else hideOverlayIntent(this),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        .build()

    private fun updateProgress(position: RoutePosition) {
        val progress = (position.progress * 100).toInt().coerceIn(0, 100)
        if (progress == lastProgress) return
        lastProgress = progress
        MockLocationPreferences.saveProgress(this, progress)
        refreshControls()
    }

    private fun refreshControls() {
        floatingControl.render(simulator != null, lastProgress.coerceAtLeast(0),
            floatingDialog?.isShowing == true || floatingReminder?.isShowing == true)
        if (foreground) getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification())
    }

    private fun toast(message: Int) { Toast.makeText(this, message, Toast.LENGTH_LONG).show() }

    companion object {
        const val ACTION_STATUS = "com.kaojiang.routeplayer.STATUS"
        const val EXTRA_STATUS = "status"
        const val EXTRA_MESSAGE = "message"
        const val EXTRA_PROGRESS = "progress"
        const val EXTRA_OVERLAY = "overlay"
        const val EXTRA_ROUTE_ID = "route_id"
        const val STATUS_RUNNING = "running"
        const val STATUS_ROUTE_RUNNING = "route_running"
        const val STATUS_ROUTE_COMPLETED = "route_completed"
        const val STATUS_STOPPED = "stopped"
        const val STATUS_ERROR = "error"
        private const val ACTION_START = "com.kaojiang.routeplayer.START"
        private const val ACTION_STOP = "com.kaojiang.routeplayer.STOP"
        private const val ACTION_QUERY = "com.kaojiang.routeplayer.QUERY"
        private const val ACTION_SHOW_OVERLAY = "com.kaojiang.routeplayer.SHOW_OVERLAY"
        private const val ACTION_HIDE_OVERLAY = "com.kaojiang.routeplayer.HIDE_OVERLAY"
        private const val CHANNEL = "kaojiang_route_player"
        private const val NOTIFICATION_ID = 0x52504C
        fun startSelectedRouteIntent(context: Context, consentToken: String?, routeId: String = BuiltInRouteStore(context).selected().id) =
            Intent(context, MockLocationService::class.java).setAction(ACTION_START)
                .putExtra(LearningConsent.EXTRA_TOKEN, consentToken).putExtra(EXTRA_ROUTE_ID, routeId)
        internal fun showOverlayIntent(context: Context, consentToken: String?) = Intent(context, MockLocationService::class.java).setAction(ACTION_SHOW_OVERLAY).putExtra(LearningConsent.EXTRA_TOKEN, consentToken)
        fun hideOverlayIntent(context: Context) = Intent(context, MockLocationService::class.java).setAction(ACTION_HIDE_OVERLAY)
        fun stopIntent(context: Context) = Intent(context, MockLocationService::class.java).setAction(ACTION_STOP)
        fun queryIntent(context: Context) = Intent(context, MockLocationService::class.java).setAction(ACTION_QUERY)
    }
}
