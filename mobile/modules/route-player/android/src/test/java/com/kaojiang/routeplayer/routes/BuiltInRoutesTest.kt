package com.kaojiang.routeplayer.routes

import com.kaojiang.routeplayer.model.Coordinates
import java.security.MessageDigest
import org.junit.Assert.*
import org.junit.Test

class BuiltInRoutesTest {
    private fun source(entry: BuiltInRoute) = checkNotNull(javaClass.getResourceAsStream("/${entry.assetName}"))
        .use { it.readBytes() }

    @Test fun originalRouteKeepsItsPointsAndSpeedButNowRestartsInALoop() {
        val entry = BuiltInRoutes.default
        val route = entry.decode(source(entry).toString(Charsets.UTF_8))
        assertEquals("瞎JB乱跑", route.name)
        assertEquals(FixedRoute.ROUTE_ID, route.id)
        assertEquals(24, route.waypoints.size)
        assertEquals(12.0, route.speedKph, 0.0)
        assertTrue(route.loop)
        assertTrue(route.restartOnLoop)
    }

    @Test fun suppliedNewDocumentsArePreservedAndOnlyPlaybackMetadataIsOverridden() {
        val expected = listOf(
            Triple("操场循环跑", 4, "4b9725171d9b3067e5757f74df90725ffe5758fea973215072fdcb426a51e7e3"),
            Triple("爱心", 22, "9cb3d3c939eecdb0f10e324e9cb703e998bb7ddeb0281e5385eec9b085b9e44c"),
        )
        BuiltInRoutes.entries.drop(1).zip(expected).forEach { (entry, supplied) ->
            val bytes = source(entry)
            val source = bytes.toString(Charsets.UTF_8)
            val document = RouteFileCodec.decode(source)
            val route = entry.decode(source)
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            assertEquals(supplied.third, digest)
            assertEquals(RepeatMode.ONCE, document.draft.repeat)
            assertEquals(document.draft.pathPoints, route.waypoints.map { it.coordinates })
            assertEquals(supplied.first, route.name)
            assertEquals(supplied.second, route.waypoints.size)
            assertEquals(20.0, route.speedKph, 0.0)
            assertTrue(route.loop)
            assertTrue(route.restartOnLoop)
        }
    }

    @Test fun restartLoopsJumpAtTheExactEndpointWithoutAddingAReturnLeg() {
        BuiltInRoutes.entries.forEach { entry ->
            val route = entry.decode(source(entry).toString(Charsets.UTF_8))
            val pathDistance = route.waypoints.zipWithNext().sumOf { (a, b) -> GeoMath.distanceMeters(a.coordinates, b.coordinates) }
            val lapDuration = pathDistance / (route.speedKph / 3.6)
            val simulator = RouteSimulator(route)
            val completedLap = simulator.advance(lapDuration)
            assertEquals(1, completedLap.lap)
            assertEquals(route.waypoints.first().coordinates, completedLap.coordinates)
            assertEquals(0.0, completedLap.progress, 1e-9)
            assertFalse(completedLap.isComplete)
            val continued = simulator.advance(lapDuration * 2 + 1)
            assertEquals(3, continued.lap)
            assertEquals(route.speedKph / 3.6, GeoMath.distanceMeters(route.waypoints.first().coordinates, continued.coordinates), 0.01)
            assertFalse(continued.isComplete)
        }
    }

    @Test fun restartHonorsEndpointStopsThenRestartsWithoutTravelTime() {
        val route = SimulationRoute(name = "Stops", speedKph = 36.0, loop = true, restartOnLoop = true,
            waypoints = listOf(
                RouteWaypoint(name = "Start", coordinates = Coordinates(0.0, 0.0)),
                RouteWaypoint(name = "End", coordinates = Coordinates(0.001, 0.0), stopDurationSeconds = 5),
            ))
        val simulator = RouteSimulator(route)
        val travelSeconds = GeoMath.distanceMeters(route.waypoints.first().coordinates, route.waypoints.last().coordinates) / 10
        val stopped = simulator.advance(travelSeconds + 2)
        assertEquals(route.waypoints.last().coordinates, stopped.coordinates)
        assertTrue(stopped.isStopped)
        val restarted = simulator.advance(3.0)
        assertEquals(route.waypoints.first().coordinates, restarted.coordinates)
        assertEquals(1, restarted.lap)
    }

    @Test fun restartDistanceAndDocumentRoundTripExcludeTheReturnLeg() {
        val draft = RouteDraft(repeat = RepeatMode.RESTART, pathPoints = listOf(Coordinates(0.0, 0.0), Coordinates(0.001, 0.0)))
        assertEquals(GeoMath.distanceMeters(draft.pathPoints.first(), draft.pathPoints.last()), draft.distanceMeters(), 1e-9)
        val restored = RouteFileCodec.decode(RouteFileCodec.encode(RouteDocument("Restart", draft)))
        assertEquals(RepeatMode.RESTART, restored.draft.repeat)
        assertTrue(restored.draft.toRoute().restartOnLoop)
    }
}
