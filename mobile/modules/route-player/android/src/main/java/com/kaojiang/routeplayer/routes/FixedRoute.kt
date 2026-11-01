package com.kaojiang.routeplayer.routes

/** A fixed route retains the supplied document's order, speed, and repeat mode. */
object FixedRoute {
    const val ASSET_NAME = "kaojiang-route-player.rplroute.json"
    const val ROUTE_ID = "route-player-fixed"

    fun decode(source: String): SimulationRoute {
        val document = RouteFileCodec.decode(source)
        return document.draft.toRoute().copy(
            id = ROUTE_ID,
            name = document.name,
            createdAt = document.createdAt,
        )
    }
}
