package com.nekoflow.auth;

public interface AuthMailService {
    void sendVerification(String to, String username, String token);
    void sendPasswordReset(String to, String username, String token);
    void sendPasswordChanged(String to, String username);
}
