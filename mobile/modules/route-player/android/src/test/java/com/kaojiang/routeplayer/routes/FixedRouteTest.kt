package com.kaojiang.routeplayer.routes

import com.kaojiang.routeplayer.model.Coordinates
import java.security.MessageDigest
import org.junit.Assert.*
import org.junit.Test

class FixedRouteTest {
    private fun source(): String = checkNotNull(javaClass.getResourceAsStream("/${FixedRoute.ASSET_NAME}")).use { it.readBytes().toString(Charsets.UTF_8) }
    private fun route() = FixedRoute.decode(source())

    @Test fun suppliedFileIsBundledWithoutChangingAnyBytes() {
        val bytes = checkNotNull(javaClass.getResourceAsStream("/${FixedRoute.ASSET_NAME}")).use { it.readBytes() }
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        assertEquals("8a3fc98a9886572f3d28dd0d29b577adc5d5dbf603df7f92cd672633ccff4edb", digest)
        assertEquals(24, route().waypoints.size)
        assertEquals(12.0, route().speedKph, 0.0)
        assertFalse(route().loop)
        assertEquals(FixedRoute.ROUTE_ID, route().id)
    }

    @Test fun coordinatesRemainLatitudeLongitudeInTheProvidedOrder() {
        val points = route().waypoints.map { it.coordinates }
        assertEquals(Coordinates(30.62061272067511, 104.12176052598264), points.first())
        assertEquals(Coordinates(30.624082584105402, 104.12145433667355), points[7])
        assertEquals(Coordinates(30.622640489542963, 104.12376313956577), points.last())
    }

    @Test fun traversesAll24PointsAt12KphAndStopsAtTheLastPoint() {
        val route = route()
        val simulator = RouteSimulator(route)
        assertEquals(route.waypoints.first().coordinates, simulator.current().coordinates)
        for (index in 1 until route.waypoints.size) {
            val previous = route.waypoints[index - 1].coordinates
            val target = route.waypoints[index].coordinates
            val duration = GeoMath.distanceMeters(previous, target) / (12.0 / 3.6)
            val position = simulator.advance(duration + 0.000001)
            assertTrue("point $index", GeoMath.distanceMeters(target, position.coordinates) < 0.01)
        }
        val ended = simulator.current()
        assertTrue(ended.isComplete)
        assertEquals(route.waypoints.last().coordinates, ended.coordinates)
        assertEquals(0f, ended.speedMetersPerSecond, 0f)
        assertEquals(ended.coordinates, simulator.advance(120.0).coordinates)
    }

    @Test fun aNewStartAlwaysBeginsAtTheSuppliedFirstPoint() {
        val first = RouteSimulator(route())
        assertTrue(GeoMath.distanceMeters(first.current().coordinates, first.advance(45.0).coordinates) > 100)
        val restarted = RouteSimulator(route()).current()
        assertEquals(route().waypoints.first().coordinates, restarted.coordinates)
        assertEquals(0.0, restarted.elapsedSeconds, 0.0)
    }

    @Test fun invalidFixedResourceFailsInsteadOfFallingBackToAnotherLocation() {
        assertThrows(Exception::class.java) { FixedRoute.decode("{}") }
        assertThrows(Exception::class.java) { FixedRoute.decode(source().replace("\"speed\":12", "\"speed\":0")) }
    }
}
