package com.kaojiang.routeplayer

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

internal object OfflineLearningGate {
    const val MINIMUM_ANSWERS = 11
    private const val DATABASE_NAME = "kaojiang-offline-study-v1.db"
    data class Snapshot(val day: String, val count: Int)

    private fun calendar(now: Long) = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai")).apply {
        timeInMillis = now
    }

    fun day(now: Long = System.currentTimeMillis()): String {
        val calendar = calendar(now)
        return String.format(Locale.ROOT, "%04d-%02d-%02d", calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH) + 1, calendar.get(Calendar.DAY_OF_MONTH))
    }

    fun untilMidnight(now: Long = System.currentTimeMillis()): Long {
        val midnight = calendar(now).apply {
            add(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        return midnight.timeInMillis - now
    }

    fun snapshot(context: Context, scope: String, now: Long = System.currentTimeMillis()): Snapshot {
        val day = day(now)
        val dbFile = File(File(context.filesDir, "SQLite"), DATABASE_NAME)
        if (!dbFile.isFile) return Snapshot(day, 0)
        val count = SQLiteDatabase.openDatabase(dbFile.absolutePath, null,
            SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS).use { db ->
            db.rawQuery("SELECT count(*) FROM offline_attempts WHERE scope=? AND day=?",
                arrayOf(scope, day)).use { cursor -> if (cursor.moveToFirst()) cursor.getInt(0) else 0 }
        }
        return Snapshot(day, count)
    }
}
