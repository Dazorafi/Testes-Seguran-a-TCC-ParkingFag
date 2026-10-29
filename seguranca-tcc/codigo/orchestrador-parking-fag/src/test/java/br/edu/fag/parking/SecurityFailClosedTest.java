package br.edu.fag.parking;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Security acceptance criterion. A failure deliberately exposes fail-open ingestion. */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:securityfailclosed;MODE=MySQL;DB_CLOSE_DELAY=-1", "parking.api-key="})
@AutoConfigureMockMvc @ActiveProfiles("test")
class SecurityFailClosedTest {
    @Autowired MockMvc mvc;
    @Test void missingConfiguredIngestionSecretMustNotPermitAnonymousWrites() throws Exception {
        mvc.perform(post("/api/v1/logs").contentType("application/json").content(
            "{\"logs\":[{\"source\":\"unauthenticated-probe\",\"level\":\"INFO\",\"message\":\"security test\",\"createdAt\":\""+Instant.now()+"\"}]}"))
            .andExpect(status().isUnauthorized());
    }
}
