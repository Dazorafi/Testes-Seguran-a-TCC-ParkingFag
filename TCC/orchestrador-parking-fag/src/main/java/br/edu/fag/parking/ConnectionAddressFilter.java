package br.edu.fag.parking;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

/** Never use a client-supplied forwarded address as the rate-limit identity. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ConnectionAddressFilter extends OncePerRequestFilter {
    private static final String ATTRIBUTE = ConnectionAddressFilter.class.getName() + ".address";

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                              FilterChain chain) throws ServletException, IOException {
        request.setAttribute(ATTRIBUTE, request.getRemoteAddr());
        chain.doFilter(request, response);
    }
    static String address(HttpServletRequest request) {
        Object captured = request.getAttribute(ATTRIBUTE);
        return captured instanceof String value ? value : request.getRemoteAddr();
    }
}
