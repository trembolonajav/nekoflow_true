package com.nekoflow.content;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ContentController.class)
@org.springframework.context.annotation.Import(com.nekoflow.auth.SecurityConfig.class)
class ContentControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockBean
    private ContentDocumentRepository repository;

    @MockBean
    private com.nekoflow.auth.UserRepository users;

    @Test
    void returnsStoredPayloadAsIs() throws Exception {
        var payload = new ObjectMapper().readTree("{\"hero\":[{\"title\":\"Frieren\"}]}");
        given(repository.findById("home")).willReturn(Optional.of(new ContentDocument("home", payload)));

        mvc.perform(get("/api/content/home"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hero[0].title").value("Frieren"));
    }

    @Test
    void unknownKeyIs404() throws Exception {
        given(repository.findById("nada")).willReturn(Optional.empty());

        mvc.perform(get("/api/content/nada")).andExpect(status().isNotFound());
    }
}
