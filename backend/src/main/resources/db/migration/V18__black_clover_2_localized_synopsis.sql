-- Sinopses revisadas para a ficha de Black Clover 2nd Season.
-- O título continua canônico; somente o conteúdo editorial é localizado.
INSERT INTO work_translation(work_id, language, synopsis_short, synopsis_full, source)
SELECT x.work_id, v.language, v.synopsis, v.synopsis, 'Tradução editorial NekoFlow · AniList'
FROM external_identifier x
CROSS JOIN (VALUES
    ('pt-BR', 'Enquanto a tirania toma conta do Reino Clover, Asta e os Cavaleiros Mágicos lançam uma incursão desesperada ao Reino Spade para resgatar os capitães de seus esquadrões da Tríade Negra. Mas a missão os leva a uma batalha brutal contra forças diferentes de tudo o que já enfrentaram. Agora, Asta precisa superar adversidades impossíveis para proteger seus amigos e honrar a promessa que fez a Yuno.'),
    ('es', 'Mientras la tiranía se apodera del Reino del Trébol, Asta y los Caballeros Mágicos emprenden una incursión desesperada en el Reino de la Pica para rescatar a los capitanes de sus escuadrones de la Tríada Oscura. Pero su misión los conduce a una batalla brutal contra fuerzas distintas de todo lo que han enfrentado. Ahora, Asta debe superar probabilidades imposibles para proteger a sus amigos y honrar la promesa que le hizo a Yuno.')
) AS v(language, synopsis)
WHERE x.provider='ANILIST' AND x.external_id='195604'
ON CONFLICT (work_id, language) DO UPDATE SET
    synopsis_short=EXCLUDED.synopsis_short,
    synopsis_full=EXCLUDED.synopsis_full,
    source=EXCLUDED.source,
    updated_at=now();
