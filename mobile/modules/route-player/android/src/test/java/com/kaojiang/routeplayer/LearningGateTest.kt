package com.kaojiang.routeplayer

import android.app.Application
import android.content.Context
import android.os.Looper
import com.kaojiang.routeplayer.routes.RoutePlayerActivity
import com.kaojiang.routeplayer.location.MockLocationService
import com.kaojiang.routeplayer.location.MockLocationPreferences
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class LearningGateTest {
    private val context: Context get() = RuntimeEnvironment.getApplication()
    private val identity = "fixture-user:fixture-certificate"
    @Before fun reset() { LearningGateAccess.setIdentity(context, null) }
    private fun body(duration: Long = 60_000) = JSONObject().put("allowed", true)
        .put("scope", LearningGateAccess.identity(identity)).put("day", "2026-10-24")
        .put("validForMs", duration)

    @Test fun onlyValidatedMatchingAccountCanOpen() {
        assertFalse(LearningGateAccess.isAllowed())
        LearningGateAccess.setIdentity(context, identity)
        LearningGateAccess.acceptValidated(context, body().toString())
        assertTrue(LearningGateAccess.isAllowed())
        LearningGateAccess.setIdentity(context, "other-user:fixture-certificate")
        assertFalse(LearningGateAccess.isAllowed())
    }
    @Test fun changingCertificateAndLogoutRevokeTheGrant() {
        allowStudyFixture(); LearningGateAccess.setIdentity(context, "fixture-user:other-certificate")
        assertFalse(LearningGateAccess.isAllowed())
        allowStudyFixture(); LearningGateAccess.setIdentity(context, null)
        assertFalse(LearningGateAccess.isAllowed())
    }
    @Test fun elapsedTimeExpiryCannotBeExtendedByChangingTheWallClock() {
        LearningGateAccess.setIdentity(context, identity)
        LearningGateAccess.acceptValidated(context, body(1000).toString())
        assertTrue(LearningGateAccess.isAllowed())
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1001))
        assertFalse(LearningGateAccess.isAllowed())
    }
    @Test fun malformedAndUnboundedGrantsAreRejected() {
        LearningGateAccess.setIdentity(context, identity)
        for (response in listOf(body(0), body(86_400_001), body().put("allowed", false), body().put("scope", "wrong"))) {
            assertThrows(Exception::class.java) { LearningGateAccess.acceptValidated(context, response.toString()) }
            assertFalse(LearningGateAccess.isAllowed())
        }
    }
    @Test fun directActivityAndOverlayServiceEntryAreDeniedWithoutStudy() {
        val activity = Robolectric.buildActivity(RoutePlayerActivity::class.java).create().get()
        assertTrue(activity.isFinishing)
        val controller = Robolectric.buildService(MockLocationService::class.java).create()
        val service = controller.get()
        service.onStartCommand(MockLocationService.showOverlayIntent(service, null), 0, 1)
        assertFalse(MockLocationPreferences.isActive(context))
        controller.destroy()
    }
    @Test fun gatewayRequiresHttpsAndNeverAcceptsEmbeddedCredentialsOrQuery() {
        assertEquals("https://fixture.example/api/location-learning/consume", LearningGateGateway.endpoint("https://fixture.example/api/", false).toString())
        for (url in listOf("http://fixture.example/api", "https://user:pass@fixture.example/api", "https://fixture.example/api?x=1", "https://fixture.example/api#x"))
            assertThrows(Exception::class.java) { LearningGateGateway.endpoint(url, false) }
        assertEquals("localhost", LearningGateGateway.endpoint("http://localhost:1234/api", true).host)
        assertThrows(Exception::class.java) { LearningGateGateway.endpoint("http://localhost:1234/api", false) }
    }
}
