package com.kaojiang.routeplayer

import android.content.Intent
import com.kaojiang.routeplayer.routes.RoutePlayerActivity
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RoutePlayerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("AceExamRoutePlayer")
        AsyncFunction("open") {
            val activity = appContext.throwingActivity
            activity.startActivity(Intent(activity, RoutePlayerActivity::class.java))
        }.runOnQueue(Queues.MAIN)
    }
}
