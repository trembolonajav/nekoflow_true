-- Traduções editoriais da ficha usada para validar o seletor PT/EN/ES.
-- Títulos continuam canônicos em romaji; somente o texto editorial é localizado.
INSERT INTO work_translation(work_id, language, synopsis_short, synopsis_full, source)
SELECT x.work_id, v.language, v.synopsis, v.synopsis, 'Tradução editorial NekoFlow · AniList'
FROM external_identifier x
CROSS JOIN (VALUES
    ('pt-BR', 'Como seria o mundo se 80% da população manifestasse superpoderes extraordinários chamados “Individualidades” aos quatro anos? Heróis e vilões estariam lutando por toda parte! Tornar-se um herói significaria aprender a usar seu poder, mas onde você estudaria? No curso de heróis da Escola U.A., é claro! Mas o que você faria se fosse uma das 20% das pessoas que nasceram sem Individualidade?'),
    ('es', '¿Cómo sería el mundo si el 80 % de la población manifestara extraordinarios superpoderes llamados «Dones» a los cuatro años? ¡Héroes y villanos lucharían por todas partes! Convertirse en héroe implicaría aprender a usar tu poder, pero ¿dónde estudiarías? ¡En el curso de héroes de la Academia U.A., por supuesto! Pero ¿qué harías si fueras una de las personas del 20 % que nacieron sin Don?')
) AS v(language, synopsis)
WHERE x.provider='ANILIST' AND x.external_id='21459'
ON CONFLICT (work_id, language) DO UPDATE SET
    synopsis_short=EXCLUDED.synopsis_short,
    synopsis_full=EXCLUDED.synopsis_full,
    source=EXCLUDED.source,
    updated_at=now();
