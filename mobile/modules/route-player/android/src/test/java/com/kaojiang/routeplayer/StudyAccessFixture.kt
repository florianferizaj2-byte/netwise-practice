package com.kaojiang.routeplayer

import android.app.Application
import org.json.JSONObject
import org.robolectric.RuntimeEnvironment

/** Existing route/consent tests run as a user who already passed today's quiz. */
fun allowStudyFixture() {
    val context = RuntimeEnvironment.getApplication()
    val identity = "fixture-user:fixture-certificate"
    LearningGateAccess.setIdentity(context, identity)
    LearningGateAccess.acceptValidated(context, JSONObject().put("allowed", true)
        .put("scope", LearningGateAccess.identity(identity)).put("day", "2026-10-24")
        .put("validForMs", 86_400_000L).toString())
}
