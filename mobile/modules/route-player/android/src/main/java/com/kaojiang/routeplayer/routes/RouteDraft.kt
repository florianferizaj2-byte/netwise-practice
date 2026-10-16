package com.kaojiang.routeplayer.routes

import com.kaojiang.routeplayer.model.Coordinates

enum class SelectionMode { TWO_POINTS, PATH }
enum class RepeatMode { ONCE, CLOSED_LOOP, PING_PONG, RESTART }
enum class AddPointResult { ADDED, FULL, TOO_CLOSE }

/** Keeps each mode's points separately, so switching modes never erases a route. */
data class RouteDraft(
    val mode: SelectionMode = SelectionMode.PATH,
    val repeat: RepeatMode = RepeatMode.ONCE,
    val speedKph: Double = 6.0,
    val twoPoints: List<Coordinates> = emptyList(),
    val pathPoints: List<Coordinates> = emptyList(),
) {
    init {
        require(speedKph.isFinite() && speedKph in MIN_SPEED..MAX_SPEED)
        require(twoPoints.size <= 2 && pathPoints.size <= MAX_POINTS)
    }

    val points: List<Coordinates> get() = if (mode == SelectionMode.TWO_POINTS) twoPoints else pathPoints
    val canStart: Boolean get() = points.size >= 2 && points.distinct().size >= 2

    fun add(point: Coordinates): Pair<RouteDraft, AddPointResult> {
        if (points.size >= if (mode == SelectionMode.TWO_POINTS) 2 else MAX_POINTS) {
            return this to AddPointResult.FULL
        }
        if (points.lastOrNull()?.let { GeoMath.distanceMeters(it, point) < 1.0 } == true) {
            return this to AddPointResult.TOO_CLOSE
        }
        return withPoints(points + point) to AddPointResult.ADDED
    }

    fun withPoints(points: List<Coordinates>): RouteDraft = if (mode == SelectionMode.TWO_POINTS) {
        copy(twoPoints = points.toList())
    } else {
        copy(pathPoints = points.toList())
    }

    fun playbackPoints(): List<Coordinates> = if (repeat == RepeatMode.PING_PONG && points.size > 2) {
        points + points.drop(1).dropLast(1).asReversed()
    } else {
        points
    }

    fun distanceMeters(): Double {
        val playback = playbackPoints()
        var distance = playback.zipWithNext().sumOf { (a, b) -> GeoMath.distanceMeters(a, b) }
        if ((repeat == RepeatMode.CLOSED_LOOP || repeat == RepeatMode.PING_PONG) && playback.size >= 2) {
            distance += GeoMath.distanceMeters(playback.last(), playback.first())
        }
        return distance
    }

    fun toRoute(): SimulationRoute {
        require(canStart)
        return SimulationRoute(
            id = "route-player-active",
            name = if (mode == SelectionMode.TWO_POINTS) "两点移动" else "路径移动",
            waypoints = playbackPoints().mapIndexed { index, point ->
                RouteWaypoint(name = "点 ${index + 1}", coordinates = point)
            },
            speedKph = speedKph,
            loop = repeat != RepeatMode.ONCE,
            restartOnLoop = repeat == RepeatMode.RESTART,
        )
    }

    companion object {
        const val MIN_SPEED = 0.5
        const val MAX_SPEED = 120.0
        const val MAX_POINTS = 200
    }
}
