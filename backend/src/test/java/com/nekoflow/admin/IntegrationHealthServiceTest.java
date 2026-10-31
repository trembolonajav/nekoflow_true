package com.nekoflow.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.nekoflow.catalog.AniListClient;
import com.nekoflow.catalog.HiAnimeApiClient;
import com.nekoflow.catalog.MangaLivreApiClient;
import com.nekoflow.catalog.SushiAnimesCatalogClient;
import com.nekoflow.catalog.UnofficialReadingApiClient;
import com.nekoflow.catalog.WeebCentralApiClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class IntegrationHealthServiceTest {

    @Test
    void testsEveryRegisteredIntegrationAndKeepsIndividualFailuresIsolated() throws Exception {
        AniListClient anilist = mock(AniListClient.class);
        HiAnimeApiClient hianime = mock(HiAnimeApiClient.class);
        MangaLivreApiClient mangalivre = mock(MangaLivreApiClient.class);
        WeebCentralApiClient weebcentral = mock(WeebCentralApiClient.class);
        SushiAnimesCatalogClient sushi = mock(SushiAnimesCatalogClient.class);
        UnofficialReadingApiClient reading = mock(UnofficialReadingApiClient.class);

        when(anilist.health()).thenReturn(new AniListClient.Health("UP", 1));
        when(hianime.health()).thenReturn(1L);
        when(mangalivre.health()).thenReturn(new MangaLivreApiClient.Health("UP", 1, 10));
        when(weebcentral.health()).thenReturn(new WeebCentralApiClient.Health("UP", 1, "en"));
        when(sushi.health()).thenReturn(new SushiAnimesCatalogClient.Health("UP", 1, 2));
        when(reading.health(UnofficialReadingApiClient.TIA)).thenThrow(new RuntimeException("Cloudflare 403"));
        when(reading.health(UnofficialReadingApiClient.COMIX))
                .thenReturn(new UnofficialReadingApiClient.Health("UP", 1, "en", 24, "comix"));
        when(reading.health(UnofficialReadingApiClient.BUDDY))
                .thenReturn(new UnofficialReadingApiClient.Health("UP", 1, "en", 24, "buddy"));

        IntegrationHealthService service = new IntegrationHealthService(
                anilist, hianime, mangalivre, weebcentral, sushi, reading);
        List<Map<String, Object>> results = service.testAll();

        assertThat(results).hasSize(8);
        assertThat(status(results, UnofficialReadingApiClient.TIA)).isEqualTo("DOWN");
        assertThat(status(results, UnofficialReadingApiClient.COMIX)).isEqualTo("UP");
        assertThat(status(results, UnofficialReadingApiClient.BUDDY)).isEqualTo("UP");
        assertThat(results).filteredOn(item -> Boolean.TRUE.equals(item.get("ok"))).hasSize(7);
    }

    private static String status(List<Map<String, Object>> results, String code) {
        return results.stream().filter(item -> code.equals(item.get("code")))
                .map(item -> (String) item.get("status")).findFirst().orElseThrow();
    }
}
