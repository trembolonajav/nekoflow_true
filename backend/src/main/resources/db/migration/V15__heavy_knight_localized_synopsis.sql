-- Primeira ficha trilingue revisada. As demais obras usam a cadeia de fallback
-- do catálogo até receberem tradução editorial.
INSERT INTO work_translation(work_id,language,synopsis_short,synopsis_full,source) VALUES
(180136,'pt-BR',
 'Expulso após despertar a classe considerada defeituosa de Cavaleiro Pesado, Elymas usa as memórias de um jogo de outra vida para provar o verdadeiro potencial da classe.',
 'Nascido em uma prestigiada família de mestres espadachins, Elymas Edvaughn vê seu futuro ruir ao despertar a classe considerada defeituosa de Cavaleiro Pesado. Deserdado e expulso, ele recupera memórias de outra vida e percebe que aquele mundo espelha um jogo que dominava. Com um conhecimento que ninguém mais possui, parte para reescrever seu destino e demonstrar a força da classe tida como a mais fraca.',
 'Tradução editorial NekoFlow a partir da sinopse creditada pelo AniList'),
(180136,'es',
 'Expulsado tras despertar la supuestamente defectuosa clase Caballero Pesado, Elymas usa los recuerdos de un juego de otra vida para demostrar el verdadero potencial de la clase.',
 'Nacido en una prestigiosa familia de maestros espadachines, Elymas Edvaughn ve cómo su futuro se derrumba al despertar la clase considerada defectuosa de Caballero Pesado. Desheredado y expulsado, recupera recuerdos de otra vida y comprende que aquel mundo refleja un juego que dominaba. Con conocimientos que nadie más posee, se dispone a reescribir su destino y demostrar la fuerza de la clase considerada la más débil.',
 'Traducción editorial NekoFlow a partir de la sinopsis acreditada por AniList')
ON CONFLICT (work_id,language) DO UPDATE SET synopsis_short=EXCLUDED.synopsis_short,
    synopsis_full=EXCLUDED.synopsis_full,source=EXCLUDED.source,updated_at=now();
