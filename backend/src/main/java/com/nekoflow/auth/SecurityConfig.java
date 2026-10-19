package com.nekoflow.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.api.ApiErrors;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Sessão por cookie (HttpOnly) + proteção CSRF (cookie XSRF-TOKEN, cabeçalho X-XSRF-TOKEN).
 * Toda autorização é validada aqui no servidor, por papel.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, UserRepository users, ObjectMapper objectMapper) throws Exception {
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null);
        http
                .csrf(c -> c.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(csrfHandler))
                .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
                .addFilterBefore(new RoleRefreshFilter(users, securityContextRepository()),
                        org.springframework.security.web.access.intercept.AuthorizationFilter.class)
                .securityContext(c -> c.securityContextRepository(securityContextRepository()))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/auth/**", "/api/content/**", "/api/catalog/**", "/api/v1/works/**",
                                "/api/v1/genres", "/api/v1/franchises/**", "/api/v1/seasons/**",
                                "/api/v1/episodes/**", "/api/v1/chapters/**", "/api/calendar",
                                "/actuator/health").permitAll()
                        .requestMatchers("/api/v1/me/**").authenticated()
                        .requestMatchers("/api/admin/users/**").hasRole("ADMIN")
                        .requestMatchers("/api/admin/releases/**", "/api/admin/works/**", "/api/admin/catalog/**")
                        .hasRole("EDITOR")
                        .requestMatchers("/api/admin/**").hasRole("MODERATOR")
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((request, response, exception) -> {
                            response.setStatus(HttpStatus.UNAUTHORIZED.value());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            objectMapper.writeValue(response.getOutputStream(), ApiErrors.body(
                                    HttpStatus.UNAUTHORIZED,
                                    "AUTHENTICATION_REQUIRED",
                                    "Entre na sua conta para continuar.",
                                    request));
                        })
                        .accessDeniedHandler((request, response, exception) -> {
                            response.setStatus(HttpStatus.FORBIDDEN.value());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            objectMapper.writeValue(response.getOutputStream(), ApiErrors.body(
                                    HttpStatus.FORBIDDEN,
                                    "ACCESS_DENIED",
                                    "Você não tem permissão para realizar esta operação.",
                                    request));
                        }))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable);
        return http.build();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        java.util.Map<String, PasswordEncoder> encoders = new java.util.HashMap<>();
        encoders.put("argon2", Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8());
        encoders.put("bcrypt", new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder());
        DelegatingPasswordEncoder encoder = new DelegatingPasswordEncoder("argon2", encoders);
        encoder.setDefaultPasswordEncoderForMatches(encoders.get("bcrypt"));
        return encoder;
    }

    @Bean
    UserDetailsService userDetailsService(UserRepository users) {
        return login -> users.findByLogin(login)
                .map(NekoPrincipal::of)
                .orElseThrow(() -> new UsernameNotFoundException("not found"));
    }

    @Bean
    AuthenticationManager authenticationManager(UserDetailsService uds, PasswordEncoder encoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(encoder);
        provider.setUserDetailsService(uds);
        return new ProviderManager(provider);
    }

    /** Garante que o cookie XSRF-TOKEN seja emitido já na primeira resposta. */
    static final class CsrfCookieFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                throws ServletException, IOException {
            CsrfToken token = (CsrfToken) req.getAttribute(CsrfToken.class.getName());
            if (token != null) {
                token.getToken();
            }
            chain.doFilter(req, res);
        }
    }
}
