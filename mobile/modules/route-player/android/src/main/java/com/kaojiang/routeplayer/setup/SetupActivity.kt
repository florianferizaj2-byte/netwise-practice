package com.kaojiang.routeplayer.setup

import android.Manifest
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.TextView
import android.widget.Toast
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import androidx.appcompat.app.AlertDialog
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.view.ViewCompat
import com.kaojiang.routeplayer.R
import com.kaojiang.routeplayer.databinding.ActivitySetupBinding
import com.kaojiang.routeplayer.location.MockLocationAccess
import com.kaojiang.routeplayer.location.MockLocationPreferences
import com.kaojiang.routeplayer.location.MockLocationService
import com.kaojiang.routeplayer.ui.FloatingControlPreferences
import com.kaojiang.routeplayer.ui.LearningConsent
import com.kaojiang.routeplayer.ui.MinimalActivity

class SetupActivity : MinimalActivity() {
    private lateinit var binding: ActivitySetupBinding
    private var scrollToSection = false
    private var overlayRequested = false
    private var overlayPermissionLaunched = false
    private var overlayLocationLaunched = false
    private var updatingSwitch = false
    private var receiverRegistered = false
    private var authorHelpDialog: AlertDialog? = null
    private val consentToken get() = intent.getStringExtra(LearningConsent.EXTRA_TOKEN)
    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        if (overlayRequested) {
            overlayLocationLaunched = false
            if (hasPreciseLocation()) binding.root.post { if (!isFinishing && !isDestroyed) enableOverlay() }
            else { overlayRequested = false; Toast.makeText(this, R.string.simple_permission_required, Toast.LENGTH_LONG).show() }
        }
        refresh()
    }
    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (MockLocationPreferences.isOverlayActive(this@SetupActivity)) overlayRequested = false
            refresh()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)
        applySystemInsets(binding.root)
        binding.developerBody.text = getString(R.string.simple_developer_body, applicationInfo.loadLabel(packageManager))
        scrollToSection = savedInstanceState == null
        overlayRequested = savedInstanceState?.getBoolean("overlayRequested") ?: false
        overlayPermissionLaunched = savedInstanceState?.getBoolean("overlayPermissionLaunched") ?: false
        overlayLocationLaunched = savedInstanceState?.getBoolean("overlayLocationLaunched") ?: false
        listOf(binding.setupTitle, binding.developerTitle, binding.locationTitle, binding.backgroundTitle, binding.floatingTitle).forEach {
            ViewCompat.setAccessibilityHeading(it, true)
        }
        binding.setupBack.setOnClickListener { finish() }
        binding.authorHelpButton.setOnClickListener { showAuthorHelp() }
        binding.phoneSettingsButton.setOnClickListener { openSettings(Intent(Settings.ACTION_DEVICE_INFO_SETTINGS)) }
        binding.developerSettingsButton.setOnClickListener { openSettings(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)) }
        binding.locationSettingsButton.setOnClickListener { openSettings(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) }
        binding.permissionSettingsButton.setOnClickListener { requestPermissionsOrOpenDetails() }
        binding.backgroundSettingsButton.setOnClickListener {
            openSettings(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), appDetailsIntent())
        }
        binding.floatingSettingsButton.setOnClickListener { openSettings(overlaySettingsIntent(), appDetailsIntent()) }
        binding.floatingSwitch.setOnCheckedChangeListener { _, checked ->
            if (!updatingSwitch) {
                if (checked) {
                    overlayRequested = true
                    overlayPermissionLaunched = false
                    overlayLocationLaunched = false
                    enableOverlay()
                } else {
                    overlayRequested = false
                    FloatingControlPreferences.setEnabled(this, false)
                    runCatching { startService(MockLocationService.hideOverlayIntent(this)) }
                }
                refresh()
            }
        }
    }

    override fun onStart() {
        super.onStart()
        ContextCompat.registerReceiver(this, statusReceiver, IntentFilter(MockLocationService.ACTION_STATUS), ContextCompat.RECEIVER_NOT_EXPORTED)
        receiverRegistered = true
    }

    override fun onStop() {
        if (receiverRegistered) unregisterReceiver(statusReceiver)
        receiverRegistered = false
        super.onStop()
    }

    override fun onDestroy() {
        authorHelpDialog?.dismiss()
        authorHelpDialog = null
        super.onDestroy()
    }

    private fun showAuthorHelp() {
        if (authorHelpDialog?.isShowing == true || isFinishing || isDestroyed) return
        val padding = (16 * resources.displayMetrics.density).toInt()
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, 0, padding, padding)
            addView(ImageView(this@SetupActivity).apply {
                id = R.id.authorFriendCode
                setImageResource(R.drawable.author_friend_code)
                adjustViewBounds = true
                scaleType = ImageView.ScaleType.FIT_CENTER
                contentDescription = getString(R.string.author_friend_code_description)
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            addView(TextView(this@SetupActivity).apply {
                text = getString(R.string.author_help_hint)
                textSize = 14f
                setPadding(0, padding, 0, 0)
            })
        }
        val scroll = object : ScrollView(this) {
            override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
                val maximum = (resources.displayMetrics.heightPixels * 0.65f).toInt()
                val available = if (View.MeasureSpec.getMode(heightMeasureSpec) == View.MeasureSpec.UNSPECIFIED) maximum
                    else minOf(maximum, View.MeasureSpec.getSize(heightMeasureSpec))
                super.onMeasure(widthMeasureSpec, View.MeasureSpec.makeMeasureSpec(available, View.MeasureSpec.AT_MOST))
            }
        }.apply {
            addView(content)
        }
        authorHelpDialog = AlertDialog.Builder(this)
            .setTitle(R.string.author_help_title)
            .setView(scroll)
            .setPositiveButton(R.string.author_help_close) { _, _ -> }
            .create().also { it.show() }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("overlayRequested", overlayRequested)
        outState.putBoolean("overlayPermissionLaunched", overlayPermissionLaunched)
        outState.putBoolean("overlayLocationLaunched", overlayLocationLaunched)
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        if (overlayRequested && !overlayLocationLaunched) enableOverlay()
        refresh()
        if (scrollToSection) {
            scrollToSection = false
            val section = when (intent.getStringExtra(EXTRA_SECTION)) {
                DEVELOPER -> binding.developerSection
                LOCATION -> binding.locationSection
                BACKGROUND -> binding.backgroundSection
                FLOATING -> binding.floatingSection
                else -> null
            }
            section?.let { binding.setupScroll.post { binding.setupScroll.smoothScrollTo(0, it.top) } }
        }
    }

    private fun refresh() {
        setText(binding.developerStatus, getString(if (runCatching { MockLocationAccess.isEnabled(this) }.getOrDefault(false))
            R.string.simple_developer_ready else R.string.simple_developer_pending))
        val precise = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val locationOn = LocationManagerCompat.isLocationEnabled(getSystemService(LocationManager::class.java))
        setText(binding.locationStatus, getString(when {
            !locationOn -> R.string.simple_location_required
            !precise -> R.string.simple_permission_required
            else -> R.string.simple_location_ready
        }))
        val notifications = NotificationManagerCompat.from(this).areNotificationsEnabled()
        val exempt = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        setText(binding.backgroundStatus, getString(if (exempt) R.string.simple_battery_ready else R.string.simple_battery_pending)
            + "\n" + getString(if (notifications) R.string.simple_notification_ready else R.string.simple_notification_pending))
        val overlayAllowed = Settings.canDrawOverlays(this)
        val visible = MockLocationPreferences.isOverlayActive(this)
        updatingSwitch = true
        binding.floatingSwitch.isChecked = overlayRequested || (visible && FloatingControlPreferences.isEnabled(this))
        updatingSwitch = false
        setText(binding.floatingStatus, getString(if (overlayAllowed) R.string.floating_permission_ready else R.string.floating_permission_required)
            + "\n" + getString(if (visible) R.string.floating_ready else R.string.floating_inactive))
    }

    private fun hasPreciseLocation() = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    private fun overlaySettingsIntent() = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))

    private fun enableOverlay() {
        if (!overlayRequested || isFinishing || isDestroyed) return
        if (!LearningConsent.isValid(consentToken)) {
            overlayRequested = false
            Toast.makeText(this, R.string.floating_return_learning, Toast.LENGTH_LONG).show()
            return
        }
        if (!Settings.canDrawOverlays(this)) {
            if (!overlayPermissionLaunched) {
                overlayPermissionLaunched = true
                openSettings(overlaySettingsIntent(), appDetailsIntent())
            } else overlayRequested = false
            return
        }
        if (!hasPreciseLocation()) {
            if (!overlayLocationLaunched) {
                val preferences = getSharedPreferences("kaojiang_route_player_ui", MODE_PRIVATE)
                if (preferences.getBoolean("locationAsked", false) && !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    overlayRequested = false
                    openSettings(appDetailsIntent())
                    return
                }
                preferences.edit().putBoolean("locationAsked", true).apply()
                overlayLocationLaunched = true
                permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            }
            return
        }
        overlayRequested = false
        FloatingControlPreferences.setEnabled(this, true)
        runCatching { ContextCompat.startForegroundService(this, MockLocationService.showOverlayIntent(this, consentToken)) }
            .onFailure {
                FloatingControlPreferences.setEnabled(this, false)
                Toast.makeText(this, R.string.floating_failed, Toast.LENGTH_LONG).show()
            }
    }

    private fun requestPermissionsOrOpenDetails() {
        val permissions = mutableListOf<String>()
        val preferences = getSharedPreferences("kaojiang_route_player_ui", MODE_PRIVATE)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION)
            preferences.edit().putBoolean("locationAsked", true).apply()
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            preferences.edit().putBoolean("notificationAsked", true).apply()
        }
        if (permissions.isEmpty()) {
            openSettings(appDetailsIntent())
        } else if (preferences.getBoolean("permissionRequestedInTutorial", false)
            && permissions.all { !shouldShowRequestPermissionRationale(it) }) {
            openSettings(appDetailsIntent())
        } else {
            preferences.edit().putBoolean("permissionRequestedInTutorial", true).apply()
            permissionLauncher.launch(permissions.toTypedArray())
        }
    }

    private fun appDetailsIntent() = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))

    private fun openSettings(vararg intents: Intent) {
        for (candidate in intents.toList() + Intent(Settings.ACTION_SETTINGS)) {
            if (runCatching { startActivity(candidate) }.isSuccess) return
        }
        Toast.makeText(this, R.string.simple_settings_manual, Toast.LENGTH_LONG).show()
    }

    private fun setText(view: TextView, text: String) {
        if (view.text.toString() != text) view.text = text
    }

    companion object {
        const val EXTRA_SECTION = "section"
        const val DEVELOPER = "developer"
        const val LOCATION = "location"
        const val BACKGROUND = "background"
        const val FLOATING = "floating"
    }
}
