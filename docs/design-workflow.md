# Fluxo de trabalho do Claude Design

## Regra principal

Os arquivos em `design/claude-design` e `design/originais` são referências preservadas. Nenhum
comando de build, teste, Docker ou desenvolvimento modifica esses diretórios ou sobrescreve o código
de produção.

## Gerar uma prévia para comparação

```bash
cd frontend
npm run design:preview
```

O comando escreve somente em `frontend/design-generated/`, que não participa do build e está no
`.gitignore`. O conversor recusa destinos dentro de:

- `frontend/src`;
- `frontend/public`;
- `backend`;
- `design`.

O script legado também aceita uma saída isolada explícita:

```bash
node scripts/dc-to-react.legacy.mjs ../design/claude-design C:/tmp/nekoflow-design
```

## Promover uma alteração visual

1. Exporte a nova versão para uma cópia de trabalho fora das fontes de produção.
2. Execute `npm run design:preview`.
3. Compare o componente gerado com a tela correspondente em `frontend/src`.
4. Transfira manualmente apenas a alteração visual necessária.
5. Preserve imports de serviços, sessão, progresso, hooks, acessibilidade e navegação.
6. Execute `npm test` e `npm run build`.
7. Compare as páginas afetadas em desktop e celular.

Nunca copie uma página gerada inteira sobre uma página de produção. Se uma atualização exigir uma
mudança estrutural extensa, ela deve ser revisada como uma migração própria.

## Arquivos que o conversor produzia originalmente

- `frontend/src/pages/*.jsx`;
- `frontend/src/components/Header.jsx` e `Footer.jsx`;
- `frontend/src/styles/pseudo.generated.css`;
- `frontend/public/assets`;
- `backend/src/main/resources/seed/*.json`.

Esses destinos agora estão protegidos. O teste `design-boundary.test.mjs` valida essa garantia.
