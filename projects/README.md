# Projects Platform (Product Delivery OS)

Plataforma unificada para gestão de projectos com systems engineering, agentes AI human-in-the-loop e rastreabilidade completa.

## Capacidades

- Receber documentos de requisitos do cliente (`.txt`, `.md`, etc.)
- Gerar pre-prompts AI estruturados por capability/context pack
- Importar JSON estruturado (stakeholder / funcionais / não funcionais / testes / indefinidos / fora de escopo)
- Modelo SMART lean para requisitos funcionais
- Product Delivery OS: timeline, capabilities, clusters, trace links, impact reports
- Markdown-first: conteúdo editável como texto, renderizado visualmente
- Gerir progresso por requisito e fase
- Acesso por perfil (super admin, client, partner)
- Gerar documentação técnica e proposta comercial

## Path no website

Depois de iniciar o `server.js`, o acesso é:
- `/projects`

Arquivos estáticos da app:
- `/projects/static/*`

API:
- `/api/projects/*`

## Credenciais iniciais

Definidas por variáveis de ambiente (opcional):
- `REQ_PLATFORM_SUPER_ADMIN_EMAIL` (default: `admin@yourlab.local`)
- `REQ_PLATFORM_SUPER_ADMIN_PASSWORD` (default: `change-me-now`)

## Segurança e permissões

- `super_admin`: acesso total a todos os projetos e edição completa.
- `client` e `partner`: acesso apenas aos projetos associados, visão de progresso e documentos.
- pastas de dados internos (`projects/data`, `projects/uploads`) bloqueadas por rota 403.

## Estrutura local

- `public/`: frontend da plataforma
- `api.js`: rotas e regras de negócio
- `lib/`: utilitários (markdown, etc.)
- `data/store.json`: base de dados local (versionada em git — fonte de verdade)
- `uploads/`: documentos enviados (versionados em git)
- `../generated_proposals/`: inputs de propostas geradas (versionados quando aplicável)

## Sincronizar dados com produção

Os requisitos e documentos do projecto vivem em `data/store.json`, `uploads/` e `generated_proposals/`. Depois de alterar localmente:

1. Commit e push desses ficheiros para `master`.
2. No servidor: `./scripts/deploy-pull.sh` (hard reset + restaura dados do repositório).

Não use `git pull` simples no servidor se `store.json` foi alterado em runtime — o script de deploy sobrescreve sempre com a versão do git.

## Observações

- Extração automática de texto funciona melhor com `.txt` / `.md`.
- Para `.pdf`/`.docx`, pode ser necessário colar manualmente o texto base.
- A geração de PDFs depende de script externo (`REQ_PLATFORM_BUILD_SCRIPT`) ou fallback HTML/MD.
