package com.kaojiang.routeplayer.location

import android.content.Context
import com.kaojiang.routeplayer.model.Coordinates

object MockLocationPreferences {
    private const val FILE_NAME = "kaojiang_route_player_location"
    private const val KEY_LATITUDE = "latitude"
    private const val KEY_LONGITUDE = "longitude"
    private const val KEY_ACTIVE = "active"
    private const val KEY_ROUTE_ID = "route_id"
    private const val KEY_PROGRESS = "progress"
    private const val KEY_OVERLAY_ACTIVE = "overlay_active"

    fun progress(context: Context) = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).getInt(KEY_PROGRESS, 0).coerceIn(0, 100)
    fun saveProgress(context: Context, progress: Int) { context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).edit().putInt(KEY_PROGRESS, progress.coerceIn(0, 100)).apply() }
    fun isOverlayActive(context: Context) = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).getBoolean(KEY_OVERLAY_ACTIVE, false)
    fun setOverlayActive(context: Context, active: Boolean) { context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).edit().putBoolean(KEY_OVERLAY_ACTIVE, active).apply() }

    fun coordinates(context: Context): Coordinates {
        val preferences = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
        val latitude = preferences.getString(KEY_LATITUDE, null)?.toDoubleOrNull()
        val longitude = preferences.getString(KEY_LONGITUDE, null)?.toDoubleOrNull()
        return if (latitude != null && longitude != null) {
            runCatching { Coordinates(latitude, longitude) }.getOrDefault(Coordinates.DEFAULT)
        } else {
            Coordinates.DEFAULT
        }
    }

    fun saveCoordinates(context: Context, coordinates: Coordinates) {
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LATITUDE, coordinates.latitude.toString())
            .putString(KEY_LONGITUDE, coordinates.longitude.toString())
            .apply()
    }

    fun isActive(context: Context): Boolean =
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_ACTIVE, false)

    fun setActive(context: Context, active: Boolean) {
        val editor = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ACTIVE, active)
            .remove(KEY_ROUTE_ID)
        editor.apply()
    }

    fun setRouteActive(context: Context, routeId: String) {
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ACTIVE, true)
            .putString(KEY_ROUTE_ID, routeId)
            .apply()
    }

    fun activeRouteId(context: Context): String? =
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .getString(KEY_ROUTE_ID, null)

    fun clear(context: Context) {
        context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
    }
}
