package br.edu.fag.parking;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Exercises production controllers, services, validation and repositories against isolated H2. */
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:security;MODE=MySQL;DB_CLOSE_DELAY=-1",
    "RESERVATION_MAINTENANCE_MS=3600000", "LOG_CLEANUP_MS=3600000"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired ParkingService parking;
    @Autowired ReservationRepository reservations;
    @Autowired SpotRepository spots;
    @Autowired LogRepository logs;
    private static final AtomicInteger CLIENTS = new AtomicInteger();
    private String client;

    @BeforeEach void prepareIsolatedData() {
        client = "198.51.100." + CLIENTS.incrementAndGet();
        reservations.deleteAll(); spots.deleteAll(); logs.deleteAll();
        parking.sync(new Api.Sync("parking-video", Instant.now(), List.of(
            new Api.SpotInput("SEC-A", Status.FREE, "A", false, 0,
                List.of(new Api.Point(.1,.1), new Api.Point(.2,.1), new Api.Point(.2,.2))),
            new Api.SpotInput("SEC-B", Status.FREE, "A", false, 1,
                List.of(new Api.Point(.3,.1), new Api.Point(.4,.1), new Api.Point(.4,.2))))));
    }
    private MockHttpServletRequestBuilder mutation(String path, Cookie cookie, Object body) throws Exception {
        var req = post(path).with(r -> { r.setRemoteAddr(client); return r; })
            .header("X-Parking-Client", "mobile").contentType("application/json")
            .content(json.writeValueAsString(body));
        return cookie == null ? req : req.cookie(cookie);
    }
    private Cookie session() throws Exception {
        return mvc.perform(get("/api/v1/reservations/current")).andExpect(status().isOk())
            .andReturn().getResponse().getCookie("parking_session");
    }
    private String reserve(Cookie owner) throws Exception {
        String body = mvc.perform(mutation("/api/v1/reservations", owner, Map.of("spotCode","SEC-A")))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("reservation").path("id").asText();
    }

    @ParameterizedTest(name = "IDOR: another session cannot {0} the known reservation ID")
    @ValueSource(strings = {"cancel", "confirm", "reject"})
    void idorBlocksOtherSessionEvenWithValidKnownId(String action) throws Exception {
        Cookie owner = session(), attacker = session();
        String id = reserve(owner);
        parking.events(new Api.Events("parking-video", List.of(new Api.Event("SEC-A", Status.OCCUPIED, Instant.now().plusMillis(1)))));
        mvc.perform(mutation("/api/v1/reservations/"+id+"/"+action, attacker, Map.of()))
            .andExpect(status().isNotFound());
        assertThat(reservations.findById(id).orElseThrow().status).isEqualTo(Reservation.State.PENDING_CONFIRMATION);
        mvc.perform(mutation("/api/v1/reservations/"+id+"/"+action, owner, Map.of()))
            .andExpect(status().isOk()); // Positive control: operation is valid for its owner.
    }

    @Test void idorCurrentReservationIsPrivateAndAnonymousMutationIsRejected() throws Exception {
        Cookie owner = session(), other = session();
        String id = reserve(owner);
        mvc.perform(get("/api/v1/reservations/current").cookie(other))
            .andExpect(status().isOk()).andExpect(jsonPath("$.reservation").doesNotExist());
        mvc.perform(mutation("/api/v1/reservations/"+id+"/cancel", null, Map.of()))
            .andExpect(status().isUnauthorized());
        assertThat(reservations.findById(id).orElseThrow().live()).isTrue();
    }

    @Test void sessionCookieHasTransportAndBrowserProtections() throws Exception {
        var response = mvc.perform(get("/api/v1/reservations/current").secure(true))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andReturn().getResponse();
        assertThat(response.getHeader("Set-Cookie")).contains("HttpOnly","Secure","SameSite=Strict","Path=/api/v1");
        assertThat(response.getCookie("parking_session").getValue()).matches("[A-Za-z0-9_-]{43}");
    }

    @Test void generatedSessionSamplesAreDistinctAndMalformedCookieIsReplaced() throws Exception {
        var tokens = new HashSet<String>();
        for (int i=0; i<64; i++) assertThat(tokens.add(session().getValue())).isTrue();
        var response = mvc.perform(get("/api/v1/reservations/current")
            .cookie(new Cookie("parking_session","invalid-token"))).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getCookie("parking_session").getValue()).matches("[A-Za-z0-9_-]{43}");
        // Uniqueness is a regression sample, not a mathematical proof of entropy.
    }

    @Test void forwardedHttpsStillCreatesSecureCookie() throws Exception {
        var response=mvc.perform(get("/api/v1/reservations/current")
            .header("X-Forwarded-Proto","https"))
            .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getHeader("Set-Cookie")).contains("Secure","HttpOnly","SameSite=Strict");
    }

    @Test void rfcForwardedAddressAlsoCannotEvadeRateLimit() throws Exception {
        int limited=0;
        for(int i=0;i<61;i++) {
            int result=mvc.perform(mutation("/api/v1/reservations",new Cookie("parking_session",String.format("%043d",i)),
                Map.of("spotCode","missing")).header("Forwarded","for=203.0.113."+i+";proto=https"))
                .andReturn().getResponse().getStatus();
            assertThat(result).isIn(404,429);
            if(result==429) limited++;
        }
        assertThat(limited).isPositive();
    }

    @Test void sessionStoredAsSha256AndNeverPublished() throws Exception {
        Cookie owner = session(); String id = reserve(owner);
        String expected = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
            .digest(owner.getValue().getBytes(StandardCharsets.UTF_8)));
        assertThat(reservations.findById(id).orElseThrow().tokenHash).isEqualTo(expected).isNotEqualTo(owner.getValue());
        String snapshot = mvc.perform(get("/api/v1/parking-spots")).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertThat(snapshot).doesNotContain(owner.getValue(),expected,id,"tokenHash");
        assertThat(logs.findAll()).allSatisfy(log -> assertThat(log.message).doesNotContain(owner.getValue(),expected));
    }

    @ParameterizedTest(name = "Ingestion credential rejected for route {0}")
    @ValueSource(strings = {"parking-spots/sync","parking-spots/events","logs"})
    void ingestionRejectsMissingAndIncorrectKey(String route) throws Exception {
        for (String key : List.of("", "wrong-key")) {
            mvc.perform(post("/api/v1/"+route).header("X-API-Key",key).contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        }
        assertThat(spots.count()).isEqualTo(2);
    }

    @ParameterizedTest(name = "Injection rejected in spotCode: {0}")
    @ValueSource(strings = {"' OR '1'='1", "SEC-A; DROP TABLE parking_spots;--", "<script>alert(1)</script>", "${7*7}", "$(echo SECURITY_PROBE)", "../../etc/passwd"})
    void injectionInReservationIsRejectedWithoutDatabaseMutation(String payload) throws Exception {
        mvc.perform(mutation("/api/v1/reservations",session(),Map.of("spotCode",payload)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        assertThat(spots.count()).isEqualTo(2);
        assertThat(reservations.count()).isZero();
    }

    @Test void sqlMetacharactersInLookupRemainLiteralAndDoNotEnumerateRecords() throws Exception {
        mvc.perform(get("/api/v1/parking-spots/alternatives").param("from","' OR 1=1 --"))
            .andExpect(status().isNotFound());
        assertThat(spots.count()).isEqualTo(2);
        assertThat(parking.alternatives("SEC-A")).hasSize(1); // Repository remains operational.
    }

    @Test void forgedOwnershipFieldsInJsonCannotChangeReservationOwner() throws Exception {
        Cookie owner = session(), other = session();
        String payload = json.writeValueAsString(Map.of("spotCode","SEC-A", "tokenHash",ParkingService.hash(other.getValue()),
            "activeSessionHash",ParkingService.hash(other.getValue()), "id","chosen-by-attacker"));
        var response = mvc.perform(post("/api/v1/reservations").cookie(owner)
            .with(r -> { r.setRemoteAddr(client); return r; }).header("X-Parking-Client","mobile")
            .contentType("application/json").content(payload)).andExpect(status().isCreated()).andReturn().getResponse();
        String id = json.readTree(response.getContentAsString()).path("reservation").path("id").asText();
        assertThat(id).isNotEqualTo("chosen-by-attacker");
        assertThat(reservations.findById(id).orElseThrow().tokenHash).isEqualTo(ParkingService.hash(owner.getValue()));
    }

    @Test void injectionPayloadInLogIsStoredAsLiteralData() throws Exception {
        String payload = "${7*7} <script>globalThis.securityProbe=1</script> '; DROP TABLE parking_spots; --";
        var input = Map.of("logs",List.of(Map.of("source","security-test","level","INFO","message",payload,"createdAt",Instant.now().toString())));
        mvc.perform(post("/api/v1/logs").header("X-API-Key","test-key").contentType("application/json")
            .content(json.writeValueAsString(input))).andExpect(status().isOk());
        assertThat(logs.findAll()).anySatisfy(log -> assertThat(log.message).isEqualTo(payload));
        assertThat(spots.count()).isEqualTo(2);
    }

    @Test void botWithoutClientHeaderIsForbidden() throws Exception {
        mvc.perform(post("/api/v1/reservations").cookie(session()).contentType("application/json")
            .content("{\"spotCode\":\"SEC-A\"}")).andExpect(status().isForbidden());
        assertThat(reservations.count()).isZero();
    }

    @Test void botsAreRateLimitedEvenWhenRotatingCookiesAndSpoofingForwardedIp() throws Exception {
        int limited=0;
        for (int i=0; i<61; i++) {
            int result=mvc.perform(mutation("/api/v1/reservations",new Cookie("parking_session",String.format("%043d",i)),
                    Map.of("spotCode","missing"))
                .header("X-Forwarded-For","203.0.113."+i)).andReturn().getResponse().getStatus();
            assertThat(result).isIn(404,429);
            if(result==429) limited++;
        }
        assertThat(limited).isPositive(); // 61 requests also tolerate one minute boundary during execution.
        assertThat(reservations.count()).isZero();
    }

    @Test void botsWithStableSourceAddressAreRateLimited() throws Exception {
        int limited=0;
        for(int i=0;i<61;i++) {
            int result=mvc.perform(mutation("/api/v1/reservations",
                new Cookie("parking_session",String.format("%043d",i)),Map.of("spotCode","missing")))
                .andReturn().getResponse().getStatus();
            assertThat(result).isIn(404,429);
            if(result==429) limited++;
        }
        assertThat(limited).isPositive();
        assertThat(reservations.count()).isZero();
    }

    @Test void websocketConnectionCapRejectsClient101() throws Exception {
        var events = new ParkingEvents(parking,json);
        for(int i=0;i<100;i++) {
            var socket=mock(WebSocketSession.class); when(socket.getId()).thenReturn("security-"+i); when(socket.isOpen()).thenReturn(true);
            events.afterConnectionEstablished(socket); verify(socket).sendMessage(any()); verify(socket,never()).close(any());
        }
        var excess=mock(WebSocketSession.class); when(excess.getId()).thenReturn("security-101");
        events.afterConnectionEstablished(excess); verify(excess).close(CloseStatus.SERVICE_OVERLOAD);
        verify(excess,never()).sendMessage(any());
    }
}
