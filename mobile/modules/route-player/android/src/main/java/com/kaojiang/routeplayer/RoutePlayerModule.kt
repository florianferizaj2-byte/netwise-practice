package com.kaojiang.routeplayer

import android.content.Intent
import android.content.pm.ApplicationInfo
import com.kaojiang.routeplayer.routes.RoutePlayerActivity
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class RoutePlayerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("AceExamRoutePlayer")
        AsyncFunction("setLearningIdentity") { identity: String? ->
            LearningGateAccess.setIdentity(appContext.throwingActivity, identity)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("setOfflineLearningIdentity") { identity: String? ->
            LearningGateAccess.setOfflineIdentity(appContext.reactContext ?: appContext.throwingActivity, identity)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("openAfterOfflineStudy") { scope: String, promise: Promise ->
            val activity = appContext.throwingActivity
            try {
                val snapshot = OfflineLearningGate.snapshot(activity, scope)
                activity.runOnUiThread {
                    try {
                        LearningGateAccess.acceptOffline(activity, scope, snapshot)
                        activity.startActivity(Intent(activity, RoutePlayerActivity::class.java))
                        promise.resolve(null)
                    } catch (error: Exception) { promise.reject("OFFLINE_LOCATION_STUDY_REQUIRED", error.message, error) }
                }
            } catch (error: Exception) { promise.reject("OFFLINE_LOCATION_STUDY_UNAVAILABLE", "读取本机学习记录失败，请重试", error) }
        }.runOnQueue(Queues.DEFAULT)
        AsyncFunction("openAfterStudy") { base: String, token: String, permit: String, version: String, promise: Promise ->
            val activity = appContext.throwingActivity
            val response = LearningGateGateway.verify(base, token, permit, version,
                (activity.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0)
            activity.runOnUiThread {
                try {
                    LearningGateAccess.acceptValidated(activity, response)
                    activity.startActivity(Intent(activity, RoutePlayerActivity::class.java))
                    promise.resolve(null)
                } catch (error: Exception) { promise.reject("LOCATION_LEARNING_REQUIRED", error.message, error) }
            }
        }.runOnQueue(Queues.DEFAULT)
    }
}
