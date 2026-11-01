package com.kaojiang.routeplayer

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.kaojiang.routeplayer.location.MockLocationService
import org.json.JSONObject
import java.security.MessageDigest

/** In-memory authorization only. No bearer token or client-side completion flag is persisted. */
object LearningGateAccess {
    private data class Grant(val scope: String, val issued: Long, val expires: Long)
    private val handler = Handler(Looper.getMainLooper())
    private var scope: String? = null
    private var grant: Grant? = null
    private var expiry: Runnable? = null

    internal fun identity(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    @Synchronized fun setIdentity(context: Context, value: String?) {
        val next = value?.let(::identity)
        if (scope != next) { revoke(context); scope = next }
    }

    @Synchronized fun acceptValidated(context: Context, body: String) {
        val response = JSONObject(body)
        check(response.optBoolean("allowed", false)) { "请先完成今天的专项学习题" }
        val authorizedScope = response.getString("scope")
        check(authorizedScope.matches(Regex("[a-f0-9]{64}")) && authorizedScope == scope) { "账号或证书已改变，请从考匠重新进入" }
        check(response.getString("day").matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) { "学习资格日期无效" }
        val duration = response.getLong("validForMs")
        check(duration in 1..86_400_000L) { "今日学习资格已过期" }
        expiry?.let(handler::removeCallbacks)
        val issued = SystemClock.elapsedRealtime()
        val next = Grant(authorizedScope, issued, issued + duration)
        grant = next
        expiry = Runnable { synchronized(this) { if (grant == next) revoke(context.applicationContext) } }
            .also { handler.postDelayed(it, duration) }
    }

    @Synchronized fun isAllowed(): Boolean {
        val current = grant ?: return false
        val elapsed = SystemClock.elapsedRealtime()
        return current.scope == scope && elapsed >= current.issued && elapsed < current.expires
    }

    @Synchronized fun revoke(context: Context) {
        grant = null
        expiry?.let(handler::removeCallbacks)
        expiry = null
        // Stopping/closing is always available even after access expires.
        runCatching { context.stopService(Intent(context, MockLocationService::class.java)) }
    }
}
