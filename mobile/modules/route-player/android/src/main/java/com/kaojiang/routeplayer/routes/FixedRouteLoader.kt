package com.kaojiang.routeplayer.routes

import android.content.Context

object FixedRouteLoader {
    fun load(context: Context): SimulationRoute = context.assets.open(FixedRoute.ASSET_NAME).use {
        FixedRoute.decode(RouteFileCodec.read(it))
    }
}
