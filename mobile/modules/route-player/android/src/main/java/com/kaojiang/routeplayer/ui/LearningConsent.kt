package com.kaojiang.routeplayer.ui

import android.content.Intent
import java.util.UUID

/** In-memory approval only: restored or external intents cannot carry old approval. */
internal object LearningConsent {
    const val EXTRA_TOKEN = "learning_consent"
    private val processToken = UUID.randomUUID().toString()
    private var issued = false

    fun issue(): String { issued = true; return processToken }
    fun isValid(token: String?) = issued && token == processToken
    fun accepts(intent: Intent?) = isValid(intent?.getStringExtra(EXTRA_TOKEN))
}
