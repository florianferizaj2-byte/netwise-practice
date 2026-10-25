package com.kaojiang.routeplayer.routes

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.view.ViewCompat
import com.kaojiang.routeplayer.R
import com.kaojiang.routeplayer.databinding.ActivityRoutePlayerBinding
import com.kaojiang.routeplayer.location.MockLocationAccess
import com.kaojiang.routeplayer.location.MockLocationPreferences
import com.kaojiang.routeplayer.location.MockLocationService
import com.kaojiang.routeplayer.setup.SetupActivity
import com.kaojiang.routeplayer.ui.MinimalActivity
import com.kaojiang.routeplayer.ui.LearningConsent
import com.kaojiang.routeplayer.ui.UsageDisclaimer
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import java.math.BigDecimal
import java.util.UUID
import android.widget.Toast
import com.kaojiang.routeplayer.LearningGateAccess

class RoutePlayerActivity : MinimalActivity() {
    private lateinit var binding: ActivityRoutePlayerBinding
    private val preferences by lazy { getSharedPreferences("kaojiang_route_player_ui", MODE_PRIVATE) }
    private val routes by lazy { BuiltInRouteStore(this) }
    private var displayedRouteId: String? = null
    private var displayedRoute: SimulationRoute? = null
    private var running = false
    private var requestingStart = false
    private var startingService = false
    private var stopping = false
    private var permissionPending = false
    private var receiverRegistered = false
    private var disclaimerAccepted = false
    private var consentToken: String? = null
    private var progress = 0
    private var disclaimerDialog: AlertDialog? = null
    private var routeDialog: AlertDialog? = null
    private val handler = Handler(Looper.getMainLooper())
    private val operationTimeout = Runnable {
        if (startingService || stopping) {
            running = MockLocationPreferences.isActive(this)
            val wasStopping = stopping
            resetPending()
            progress = MockLocationPreferences.progress(this)
            setStatus(if (running && !wasStopping) getString(R.string.simple_running_percent, progress) else getString(when {
                wasStopping && running -> R.string.simple_stop_failed
                wasStopping -> R.string.simple_ended
                running -> R.string.simple_running
                else -> R.string.simple_start_failed
            }))
            renderButtons()
        }
    }

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        permissionPending = false
        if (requestingStart) {
            if (hasPreciseLocation()) {
                binding.root.post { if (!isDestroyed && !isFinishing && requestingStart) startMovement() }
            } else {
                requestingStart = false
                setStatus(getString(R.string.simple_permission_required))
                renderButtons()
            }
        }
    }

    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.getStringExtra(MockLocationService.EXTRA_STATUS)) {
                MockLocationService.STATUS_RUNNING, MockLocationService.STATUS_ROUTE_RUNNING -> {
                    if (stopping) {
                        runCatching { startService(MockLocationService.stopIntent(this@RoutePlayerActivity)) }
                        return
                    }
                    running = true
                    progress = intent.getIntExtra(MockLocationService.EXTRA_PROGRESS, 0).coerceIn(0, 100)
                    requestingStart = false
                    startingService = false
                    handler.removeCallbacks(operationTimeout)
                    setStatus(getString(R.string.simple_running_percent, progress))
                }
                MockLocationService.STATUS_ROUTE_COMPLETED -> {
                    resetPending()
                    running = false
                    progress = intent.getIntExtra(MockLocationService.EXTRA_PROGRESS, 100).coerceIn(0, 100)
                    setStatus(getString(R.string.simple_ended_percent, progress))
                }
                MockLocationService.STATUS_STOPPED -> {
                    // A pre-start query may arrive after the user has already tapped Start.
                    if (startingService && !stopping) return
                    val wasRunning = running || stopping
                    running = false
                    startingService = false
                    stopping = false
                    handler.removeCallbacks(operationTimeout)
                    if (wasRunning) {
                        progress = intent.getIntExtra(MockLocationService.EXTRA_PROGRESS, progress).coerceIn(0, 100)
                        setStatus(getString(R.string.simple_ended_percent, progress))
                    }
                }
                MockLocationService.STATUS_ERROR -> {
                    resetPending()
                    running = false
                    setStatus(intent.getStringExtra(MockLocationService.EXTRA_MESSAGE) ?: getString(R.string.simple_start_failed))
                }
            }
            renderButtons()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRoutePlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)
        if (!requireDailyLearning()) return
        applySystemInsets(binding.root)
        ViewCompat.setAccessibilityHeading(binding.playerStatus, true)
        running = MockLocationPreferences.isActive(this)
        progress = MockLocationPreferences.progress(this)
        requestingStart = savedInstanceState?.getBoolean("requestingStart") ?: false
        startingService = savedInstanceState?.getBoolean("startingService") ?: false
        stopping = savedInstanceState?.getBoolean("stopping") ?: false
        permissionPending = savedInstanceState?.getBoolean("permissionPending") ?: false
        // Consent survives a screen rotation, but is never persisted between visits.
        disclaimerAccepted = savedInstanceState?.getBoolean("disclaimerAccepted") == true &&
            savedInstanceState.getString("disclaimerProcess") == consentProcessToken
        consentToken = savedInstanceState?.getString(LearningConsent.EXTRA_TOKEN)?.takeIf { LearningConsent.isValid(it) }
        disclaimerAccepted = disclaimerAccepted && consentToken != null
        setStatus(savedInstanceState?.getString("status") ?: if (running) getString(R.string.simple_running_percent, progress) else getString(R.string.simple_idle))
        binding.playPauseButton.setOnClickListener {
            if (disclaimerAccepted && !running && !requestingStart && !startingService && !stopping) {
                requestingStart = true
                startMovement()
            }
        }
        binding.playerStopButton.setOnClickListener { endMovement() }
        binding.routeSelector.setOnClickListener { showRouteSelection() }
        binding.tutorialLink.setOnClickListener { if (disclaimerAccepted) openTutorial() }
        renderButtons()
        if (!disclaimerAccepted) showUsageDisclaimer()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (!requireDailyLearning()) return
        setIntent(intent)
        disclaimerAccepted = false
        consentToken = null
        routeDialog?.dismiss()
        renderButtons()
        showUsageDisclaimer()
    }

    override fun onStart() {
        super.onStart()
        ContextCompat.registerReceiver(this, statusReceiver, IntentFilter(MockLocationService.ACTION_STATUS), ContextCompat.RECEIVER_NOT_EXPORTED)
        receiverRegistered = true
    }

    override fun onResume() {
        super.onResume()
        if (!requireDailyLearning()) return
        running = MockLocationPreferences.isActive(this)
        progress = MockLocationPreferences.progress(this)
        if (running && !stopping) setStatus(getString(R.string.simple_running_percent, progress))
        runCatching { startService(MockLocationService.queryIntent(this)) }
        renderButtons()
        if (disclaimerAccepted && requestingStart && !permissionPending && !startingService && !stopping) startMovement()
        if (startingService || stopping) watchOperation()
    }

    override fun onStop() {
        if (receiverRegistered) unregisterReceiver(statusReceiver)
        receiverRegistered = false
        super.onStop()
    }

    override fun onDestroy() {
        disclaimerDialog?.dismiss()
        disclaimerDialog = null
        routeDialog?.dismiss()
        routeDialog = null
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("requestingStart", requestingStart)
        outState.putBoolean("startingService", startingService)
        outState.putBoolean("stopping", stopping)
        outState.putBoolean("permissionPending", permissionPending)
        outState.putBoolean("disclaimerAccepted", disclaimerAccepted)
        outState.putString("disclaimerProcess", consentProcessToken)
        outState.putString(LearningConsent.EXTRA_TOKEN, consentToken)
        outState.putString("status", binding.playerStatus.text.toString())
        super.onSaveInstanceState(outState)
    }

    private fun startMovement() {
        if (!requireDailyLearning()) return
        if (!disclaimerAccepted || !requestingStart || permissionPending || startingService || stopping) return
        if (!runCatching { MockLocationAccess.isEnabled(this) }.getOrDefault(false)) {
            requestingStart = false
            setStatus(getString(R.string.simple_mock_required))
            renderButtons()
            openTutorial(SetupActivity.DEVELOPER)
            return
        }
        if (!hasPreciseLocation()) {
            if (preferences.getBoolean("locationAsked", false) && !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)) {
                requestingStart = false
                setStatus(getString(R.string.simple_permission_required))
                renderButtons()
                openTutorial(SetupActivity.LOCATION)
                return
            }
            preferences.edit().putBoolean("locationAsked", true).apply()
            permissionPending = true
            permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            renderButtons()
            return
        }
        if (!LocationManagerCompat.isLocationEnabled(getSystemService(LocationManager::class.java))) {
            requestingStart = false
            setStatus(getString(R.string.simple_location_required))
            renderButtons()
            openTutorial(SetupActivity.LOCATION)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && !preferences.getBoolean("notificationAsked", false)) {
            preferences.edit().putBoolean("notificationAsked", true).apply()
            permissionPending = true
            permissionLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
            renderButtons()
            return
        }
        startingService = true
        requestingStart = false
        setStatus(getString(R.string.simple_starting))
        renderButtons()
        watchOperation()
        runCatching { ContextCompat.startForegroundService(this, MockLocationService.startSelectedRouteIntent(this, consentToken)) }
            .onFailure {
                resetPending()
                running = false
                setStatus(getString(R.string.simple_start_failed))
                renderButtons()
            }
    }

    private fun endMovement() {
        val serviceExists = running || startingService || MockLocationPreferences.isActive(this)
        requestingStart = false
        startingService = false
        running = false
        stopping = serviceExists
        setStatus(getString(if (stopping) R.string.simple_ending else R.string.simple_ended))
        renderButtons()
        if (serviceExists) {
            watchOperation()
            runCatching { startService(MockLocationService.stopIntent(this)) }.onFailure {
                runCatching { stopService(Intent(this, MockLocationService::class.java)) }
            }
        }
    }

    private fun resetPending() {
        handler.removeCallbacks(operationTimeout)
        requestingStart = false
        startingService = false
        stopping = false
    }

    private fun requireDailyLearning(): Boolean {
        if (LearningGateAccess.isAllowed()) return true
        LearningGateAccess.revoke(this)
        Toast.makeText(this, "请先在考匠完成今天当前证书的 30 道专项学习题", Toast.LENGTH_LONG).show()
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            startActivity(it.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        }
        finish()
        return false
    }

    private fun watchOperation() {
        handler.removeCallbacks(operationTimeout)
        handler.postDelayed(operationTimeout, 10_000L)
    }

    private fun renderButtons() {
        renderRouteSelection()
        binding.playPauseButton.isEnabled = canSelectRoute() && displayedRoute != null
        binding.playerStopButton.isEnabled = running || requestingStart || startingService
        binding.routeSelector.isEnabled = canSelectRoute()
        if (!canSelectRoute()) routeDialog?.dismiss()
    }

    private fun canSelectRoute() = disclaimerAccepted && !running && !requestingStart &&
        !startingService && !stopping && !MockLocationPreferences.isActive(this)

    private fun renderRouteSelection() {
        val entry = BuiltInRoutes.find(MockLocationPreferences.activeRouteId(this)) ?: routes.selected()
        if (displayedRouteId != entry.id) {
            displayedRouteId = entry.id
            displayedRoute = runCatching { routes.load(entry.id) }.getOrNull()
        }
        binding.routeSelector.text = getString(R.string.route_selection_current, entry.name)
        binding.routeDetails.text = displayedRoute?.let { route ->
            val speed = BigDecimal.valueOf(route.speedKph).stripTrailingZeros().toPlainString()
            getString(R.string.route_selection_details, speed, getString(
                if (route.loop) R.string.route_selection_restart else R.string.route_selection_once))
        } ?: getString(R.string.simple_route_invalid)
    }

    private fun showRouteSelection() {
        if (!canSelectRoute() || routeDialog?.isShowing == true) return
        val entries = BuiltInRoutes.entries
        routeDialog = MaterialAlertDialogBuilder(this)
            .setTitle(R.string.route_selection_title)
            .setSingleChoiceItems(entries.map { it.name }.toTypedArray(), entries.indexOf(routes.selected())) { dialog, index ->
                // A floating-window start may have arrived while this dialog was open.
                if (canSelectRoute()) {
                    runCatching { routes.select(entries[index].id) }.onSuccess { route ->
                        displayedRouteId = route.id
                        displayedRoute = route
                        progress = 0
                        MockLocationPreferences.saveProgress(this, 0)
                        setStatus(getString(R.string.simple_idle))
                    }.onFailure { setStatus(getString(R.string.simple_route_invalid)) }
                }
                dialog.dismiss()
                renderButtons()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .create()
        routeDialog?.show()
    }

    private fun setStatus(text: String) {
        if (binding.playerStatus.text.toString() != text) binding.playerStatus.text = text
    }

    private fun hasPreciseLocation() = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun openTutorial(section: String? = null) {
        startActivity(Intent(this, SetupActivity::class.java).putExtra(LearningConsent.EXTRA_TOKEN, consentToken)
            .apply { section?.let { putExtra(SetupActivity.EXTRA_SECTION, it) } })
    }

    private fun showUsageDisclaimer() {
        if (disclaimerDialog?.isShowing == true || isFinishing || isDestroyed) return
        disclaimerDialog = UsageDisclaimer.create(this, onDecline = { finish() }, onAccept = {
                disclaimerAccepted = true
                consentToken = LearningConsent.issue()
                renderButtons()
            })
        disclaimerDialog?.show()
    }

    companion object {
        // A process restore must not inherit consent from an earlier process.
        private val consentProcessToken = UUID.randomUUID().toString()
    }
}
