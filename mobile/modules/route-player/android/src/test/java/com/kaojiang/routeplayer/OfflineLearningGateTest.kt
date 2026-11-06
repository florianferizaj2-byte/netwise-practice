package com.kaojiang.routeplayer

import android.app.Application
import android.database.sqlite.SQLiteDatabase
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class OfflineLearningGateTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private val scope = """["https://api.example","learner","certificate-one"]"""

    @Before fun reset() {
        LearningGateAccess.revoke(context)
        LearningGateAccess.setOfflineIdentity(context, scope)
    }

    @After fun clear() { LearningGateAccess.setOfflineIdentity(context, null) }

    @Test fun usesOnlySelectedScopeAndDayInDeviceDatabase() {
        val before = Instant.parse("2026-11-06T15:59:59Z").toEpochMilli()
        val after = before + 1000
        val file = File(File(context.filesDir, "SQLite"), "kaojiang-offline-study-v1.db")
        assertTrue(file.parentFile!!.mkdirs() || file.parentFile!!.isDirectory)
        SQLiteDatabase.openOrCreateDatabase(file, null).use { db ->
            db.execSQL("CREATE TABLE offline_attempts(scope TEXT, day TEXT)")
            repeat(11) { db.execSQL("INSERT INTO offline_attempts VALUES(?,?)", arrayOf(scope, "2026-11-06")) }
            repeat(20) { db.execSQL("INSERT INTO offline_attempts VALUES(?,?)", arrayOf("another-account", "2026-11-07")) }
        }
        assertEquals(11, OfflineLearningGate.snapshot(context, scope, before).count)
        assertEquals(0, OfflineLearningGate.snapshot(context, scope, after).count)
        assertEquals(0, OfflineLearningGate.snapshot(context, scope.replace("certificate-one", "certificate-two"), before).count)
        assertEquals(1000L, OfflineLearningGate.untilMidnight(before))
    }

    @Test fun tenAnswersStayLockedAndScopeChangeRevokesElevenAnswerGrant() {
        val day = OfflineLearningGate.day()
        assertThrows(IllegalStateException::class.java) {
            LearningGateAccess.acceptOffline(context, scope, OfflineLearningGate.Snapshot(day, 10))
        }
        assertFalse(LearningGateAccess.isAllowed())
        LearningGateAccess.acceptOffline(context, scope, OfflineLearningGate.Snapshot(day, 11))
        assertTrue(LearningGateAccess.isAllowed())
        LearningGateAccess.setOfflineIdentity(context, "another-scope")
        assertFalse(LearningGateAccess.isAllowed())
        assertThrows(IllegalStateException::class.java) {
            LearningGateAccess.acceptOffline(context, scope, OfflineLearningGate.Snapshot(day, 11))
        }
    }
}
