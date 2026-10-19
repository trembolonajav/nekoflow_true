package com.nekoflow.admin;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nekoflow.auth.NekoPrincipal;
import com.nekoflow.auth.Role;
import com.nekoflow.auth.SecurityConfig;
import com.nekoflow.auth.UserAccount;
import com.nekoflow.auth.UserRepository;
import com.nekoflow.catalog.WorkRepository;
import com.nekoflow.request.RequestService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Permissões do painel validadas no servidor, por papel. */
@WebMvcTest(AdminController.class)
@Import(SecurityConfig.class)
class AdminSecurityTest {

    @Autowired
    private MockMvc mvc;

    @MockBean
    private RequestService requests;
    @MockBean
    private ReleaseService releases;
    @MockBean
    private WorkRepository works;
    @MockBean
    private UserRepository users;
    @MockBean
    private AuditLog audit;

    @BeforeEach
    void setUp() {
        for (Role r : Role.values()) {
            long id = r.ordinal() + 1;
            given(users.findById(id)).willReturn(Optional.of(
                    new UserAccount(id, r.name().toLowerCase(), r + "@x.local", r.name(), "x", r, OffsetDateTime.now())));
        }
        given(requests.adminList(any(), any())).willReturn(List.of());
        given(releases.publish(anyLong(), anyLong(), anyInt(), any())).willReturn(Map.of("duplicate", false));
    }

    private static RequestPostProcessor as(Role role) {
        NekoPrincipal p = new NekoPrincipal(role.ordinal() + 1, role.name(), "x", role);
        return authentication(new UsernamePasswordAuthenticationToken(p, null, p.getAuthorities()));
    }

    @Test
    void anonymousGets401() throws Exception {
        mvc.perform(get("/api/admin/requests")).andExpect(status().isUnauthorized());
    }

    @Test
    void userCannotModerate() throws Exception {
        mvc.perform(get("/api/admin/requests").with(as(Role.USER))).andExpect(status().isForbidden());
    }

    @Test
    void moderatorModeratesButCannotPublish() throws Exception {
        mvc.perform(get("/api/admin/requests").with(as(Role.MODERATOR))).andExpect(status().isOk());
        mvc.perform(post("/api/admin/releases").with(as(Role.MODERATOR)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"workId\":1,\"unit\":2}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void editorPublishesButCannotManageUsers() throws Exception {
        mvc.perform(post("/api/admin/releases").with(as(Role.EDITOR)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"workId\":1,\"unit\":2}"))
                .andExpect(status().isOk());
        mvc.perform(put("/api/admin/users/1/role").with(as(Role.EDITOR)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"ADMIN\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void writesWithoutCsrfAreRejected() throws Exception {
        mvc.perform(post("/api/admin/releases").with(as(Role.ADMIN))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"workId\":1,\"unit\":2}"))
                .andExpect(status().isForbidden());
    }
}
