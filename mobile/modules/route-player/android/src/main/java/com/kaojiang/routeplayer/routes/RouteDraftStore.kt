package com.kaojiang.routeplayer.routes

import android.content.Context
import com.kaojiang.routeplayer.model.Coordinates
import org.json.JSONArray
import org.json.JSONObject

class RouteDraftStore(context: Context) {
    private val preferences = context.getSharedPreferences("route_player_draft", Context.MODE_PRIVATE)
    fun load(): RouteDraft = RouteDraftCodec.decode(preferences.getString("draft", null).orEmpty())
    fun save(draft: RouteDraft) { preferences.edit().putString("draft", RouteDraftCodec.encode(draft)).apply() }
}

object RouteDraftCodec {
    fun encode(draft: RouteDraft): String = JSONObject()
        .put("mode", draft.mode.name).put("repeat", draft.repeat.name).put("speed", draft.speedKph)
        .put("twoPoints", encodePoints(draft.twoPoints)).put("pathPoints", encodePoints(draft.pathPoints))
        .toString()

    fun decode(value: String): RouteDraft = runCatching {
        val json = JSONObject(value)
        RouteDraft(
            mode = SelectionMode.valueOf(json.getString("mode")),
            repeat = RepeatMode.valueOf(json.getString("repeat")),
            speedKph = json.getDouble("speed"),
            twoPoints = decodePoints(json.getJSONArray("twoPoints")),
            pathPoints = decodePoints(json.getJSONArray("pathPoints")),
        )
    }.getOrDefault(RouteDraft())

    private fun encodePoints(points: List<Coordinates>): JSONArray = JSONArray().apply {
        points.forEach { put(JSONArray().put(it.latitude).put(it.longitude)) }
    }
    private fun decodePoints(array: JSONArray): List<Coordinates> = List(array.length()) { index ->
        val point = array.getJSONArray(index)
        Coordinates(point.getDouble(0), point.getDouble(1))
    }
}
