package com.kaojiang.routeplayer.ui

import android.content.Context

internal object FloatingControlPreferences {
    private fun store(context: Context) = context.getSharedPreferences("kaojiang_route_player_overlay", Context.MODE_PRIVATE)
    fun isEnabled(context: Context) = store(context).getBoolean("enabled", false)
    fun setEnabled(context: Context, enabled: Boolean) { store(context).edit().putBoolean("enabled", enabled).apply() }
    fun x(context: Context) = store(context).getInt("x", -1)
    fun y(context: Context) = store(context).getInt("y", -1)
    fun savePosition(context: Context, x: Int, y: Int) { store(context).edit().putInt("x", x).putInt("y", y).apply() }
}
