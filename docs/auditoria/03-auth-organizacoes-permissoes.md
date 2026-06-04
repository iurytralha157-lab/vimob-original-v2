# Auditoria Vimob - 03 Auth, Organizacoes e Permissoes

Escopo: leitura local de `AuthContext`, guards, hooks de permissoes/modulos e pagina de selecao de organizacao. Nenhuma consulta foi feita no Supabase remoto.

## Arquivos lidos

- `src/contexts/AuthContext.tsx`
- `src/components/guards/SuperAdminRoute.tsx`
- `src/components/guards/AdminRoute.tsx`
- `src/components/guards/PermissionGuard.tsx`
- `src/components/guards/ModuleGuard.tsx`
- `src/hooks/use-user-permissions.ts`
- `src/hooks/use-organization-roles.ts`
- `src/hooks/use-organization-modules.ts`
- `src/hooks/use-user-organizations.ts`
- `src/pages/SelectOrganization.tsx`

## Modelo atual percebido

O sistema usa uma combinacao de:

- `users.organization_id` como organizacao ativa/principal do usuario.
- `organization_members` como lista de organizacoes acessiveis.
- `users.role`, `user_roles`, `organization_members.role`, `organization_roles` e `user_organization_roles` como camadas de papel/permissao.
- `localStorage` para lembrar a organizacao ativa por usuario.
- `localStorage.impersonating` para modo de impersonacao de super admin.

Isso pode funcionar, mas precisa estar muito bem documentado porque mistura identidade, organizacao ativa, memberships, roles e cache client-side.

## Achado A - Troca de organizacao altera `users.organization_id`

Local:

- `src/contexts/AuthContext.tsx`, funcao `switchOrganization`.

O que acontece:

- Ao trocar organizacao, o frontend atualiza `users.organization_id`.
- Depois busca `organization_members.role`.
- Depois tambem atualiza `users.role` para refletir o role daquela org.

Risco:

- Se o mesmo usuario estiver logado em duas abas/dispositivos, trocar org em um lugar pode alterar o contexto global no banco para todos.
- RLS baseada em `get_user_organization_id()` pode passar a enxergar outra organizacao logo apos a troca.
- Cache React Query/localStorage pode ficar desalinhado com o banco.

Classificacao:

- Prioridade alta para teste e decisao arquitetural.

Recomendacao:

- Confirmar se `users.organization_id` deve ser estado global do usuario ou apenas organizacao padrao.
- Para longo prazo, preferir contexto ativo por sessao/token/backend, nao como campo global mutavel para cada troca de tela.

## Achado B - Query keys de permissoes nao incluem organizacao

Locais:

- `src/hooks/use-user-permissions.ts`
- `src/hooks/use-organization-roles.ts`, `useHasPermission`

O que acontece:

- `useUserPermissions` usa `queryKey: ['user-permissions', profile?.id]`.
- `useHasPermission` usa `queryKey: ['has-permission', profile?.id, permissionKey]`.

Risco:

- O mesmo usuario pode trocar de organizacao, mas o cache da permissao continuar com resultado da organizacao anterior.
- Isso pode liberar ou bloquear menu/rota de forma errada ate invalidar cache.

Classificacao:

- Prioridade alta, provavel bug de multi-org.

Recomendacao:

- Incluir `organization?.id` nas query keys.
- Invalidar caches de permissao/modulos ao trocar organizacao.

## Achado C - Atribuicao de role remove por `user_id` sem escopo de organizacao

Local:

- `src/hooks/use-organization-roles.ts`, `useAssignUserRole`.

O que acontece:

- Antes de inserir nova role, o hook faz delete em `user_organization_roles` filtrando apenas por `user_id`.

Risco:

- Se `user_organization_roles` permitir roles em varias organizacoes, alterar role em uma org pode remover atribuicoes do mesmo usuario em outras orgs.

Classificacao:

- Prioridade alta para validar schema/RLS antes de mexer.

Recomendacao:

- Excluir apenas roles ligadas aos `organization_roles` da organizacao atual.
- Testar com usuario multi-org antes de mudar.

## Achado D - Impersonacao depende de `localStorage`

Local:

- `src/contexts/AuthContext.tsx`

O que acontece:

- `impersonating` e carregado de `localStorage`.
- `fetchProfile` usa esse estado para decidir qual organizacao buscar.

Risco:

- Um usuario pode manipular localStorage no navegador.
- A seguranca real precisa estar no RLS e nas policies, nao no estado local.

Classificacao:

- Medio/alto, depende da RLS atual.

Recomendacao:

- Auditar se usuarios comuns conseguem buscar organizacoes fora do escopo.
- No longo prazo, mover impersonacao para estado server-side/auditavel, com token curto ou tabela propria.

## Achado E - Safety timeout pode esconder falha de auth/org

Local:

- `src/contexts/AuthContext.tsx`, timeout de 5 segundos.

O que acontece:

- Se auth/orgs demorarem, o app forca `loading=false`, `authInitialized=true`, `organizationsLoaded=true`.

Risco:

- Pode redirecionar o usuario com estado incompleto.
- Pode mascarar problema real de carregamento, RLS ou rede.

Classificacao:

- Media.

Recomendacao:

- Manter por enquanto se foi criado para evitar tela travada.
- Registrar metricas/logs e testar cenarios lentos.
- Depois trocar por estado de erro recuperavel.

## Testes manuais recomendados

1. Usuario comum com uma organizacao: login deve ir para dashboard correto.
2. Usuario comum sem organizacao: login deve ir para onboarding/select organization corretamente.
3. Usuario multi-org: trocar org deve alterar menus, permissoes e dados imediatamente.
4. Usuario multi-org em duas abas: trocar org em uma aba nao deve vazar contexto inesperado na outra.
5. Admin de uma org e usuario comum em outra: permissoes devem mudar por org.
6. Super admin sem impersonacao: deve ir para `/admin`.
7. Super admin impersonando org: deve ver dados da org impersonada, com banner e auditoria.
8. Usuario comum tentando forjar `localStorage.impersonating`: nao deve ganhar acesso.

## Proximo passo deste bloco

Antes de alterar codigo:

- Validar schema real das tabelas `users`, `organization_members`, `organization_roles`, `user_organization_roles`, `user_roles`.
- Validar funcoes `get_user_organization_id`, `is_super_admin`, `user_has_permission`, `get_user_organization_role`.
- Confirmar se `users.organization_id` e desenho intencional ou legado.

