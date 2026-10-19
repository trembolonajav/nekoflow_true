package com.nekoflow.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class SmtpAuthMailService implements AuthMailService {
    private final JavaMailSender sender;
    private final String publicUrl;

    public SmtpAuthMailService(JavaMailSender sender, @Value("${nekoflow.public-url}") String publicUrl) {
        this.sender = sender; this.publicUrl = publicUrl;
    }

    private void send(String to, String subject, String body) {
        SimpleMailMessage m = new SimpleMailMessage();
        m.setFrom("NekoFlow <no-reply@nekoflow.local>"); m.setTo(to); m.setSubject(subject); m.setText(body);
        sender.send(m); // falha é propagada: a API nunca afirma que enviou sem enviar
    }
    public void sendVerification(String to, String username, String token) {
        send(to, "Confirme seu e-mail no NekoFlow", "Olá @" + username + ",\n\nConfirme sua conta:\n" + publicUrl + "/entrar?modo=verificar&token=" + token + "\n\nO link expira em 24 horas.");
    }
    public void sendPasswordReset(String to, String username, String token) {
        send(to, "Redefina sua senha no NekoFlow", "Olá @" + username + ",\n\nUse este link uma única vez:\n" + publicUrl + "/entrar?modo=redefinir&token=" + token + "\n\nO link expira em 30 minutos.");
    }
    public void sendPasswordChanged(String to, String username) {
        send(to, "Sua senha do NekoFlow foi alterada", "Olá @" + username + ",\n\nSua senha foi alterada e as outras sessões foram encerradas. Se não foi você, contate o suporte.");
    }
}
