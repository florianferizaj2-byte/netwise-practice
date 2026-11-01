package com.kaojiang.routeplayer.routes

import android.content.Context

data class BuiltInRoute(
    val id: String,
    val name: String,
    val assetName: String,
    val repeatOverride: RepeatMode? = null,
) {
    fun decode(source: String): SimulationRoute {
        val document = RouteFileCodec.decode(source)
        return document.draft.copy(repeat = repeatOverride ?: document.draft.repeat).toRoute().copy(
            id = id,
            name = name,
            createdAt = document.createdAt,
        )
    }
}

/** Stable IDs keep saved choices independent of display names or list order. */
object BuiltInRoutes {
    val entries = listOf(
        BuiltInRoute(FixedRoute.ROUTE_ID, "瞎JB乱跑", FixedRoute.ASSET_NAME, RepeatMode.RESTART),
        BuiltInRoute("route-player-stadium", "操场循环跑", "stadium-route.rplroute.json", RepeatMode.RESTART),
        BuiltInRoute("route-player-heart", "爱心", "heart-route.rplroute.json", RepeatMode.RESTART),
    )
    val default: BuiltInRoute get() = entries.first()
    fun find(id: String?): BuiltInRoute? = entries.firstOrNull { it.id == id }
}

class BuiltInRouteStore(private val context: Context) {
    private val preferences = context.getSharedPreferences("kaojiang_route_player_routes", Context.MODE_PRIVATE)

    fun selected(): BuiltInRoute = BuiltInRoutes.find(preferences.getString("selected", null)) ?: BuiltInRoutes.default

    fun select(id: String): SimulationRoute {
        // Validate the resource before changing the user's saved selection.
        val route = load(id)
        preferences.edit().putString("selected", id).apply()
        return route
    }

    fun load(id: String = selected().id): SimulationRoute {
        val entry = requireNotNull(BuiltInRoutes.find(id)) { "未知的内置路线" }
        return context.assets.open(entry.assetName).use { entry.decode(RouteFileCodec.read(it)) }
    }
}
