# Requirements Platform (Single Folder)

Plataforma unificada para:
- receber documento de requisitos do cliente,
- gerar pre-prompt AI para estruturar requisitos,
- importar JSON estruturado (stakeholder / funcionais / não funcionais / indefinidos / fora de escopo),
- importar JSON estruturado com framework completo de systems engineering para requisitos funcionais,
- usar modelo SMART lean para requisitos funcionais (`need`, `shall`, `condition`, `measure`, `rationale`, `verification`, `priority`),
- manter nível separado de casos de teste/aceitação ligados aos requisitos funcionais,
- gerir progresso por requisito e fase,
- permitir acesso por perfil (super admin, client, partner),
- gerar documentação técnica e proposta comercial+técnica.

## Path no website

Depois de iniciar o `server.js`, o acesso é:
- `/requirements-platform`

Arquivos estáticos da app:
- `/requirements-platform/static/*`

## Credenciais iniciais

Definidas por variáveis de ambiente (opcional):
- `REQ_PLATFORM_SUPER_ADMIN_EMAIL` (default: `admin@yourlab.local`)
- `REQ_PLATFORM_SUPER_ADMIN_PASSWORD` (default: `change-me-now`)

## Segurança e permissões

- `super_admin`: acesso total a todos os projetos e edição completa.
- `client` e `partner`: acesso apenas aos projetos associados, visão de progresso e documentos.
- pastas de dados internos (`requirements_platform/data`, `requirements_platform/uploads`) bloqueadas por rota 403.

## Estrutura local

- `public/`: frontend da plataforma
- `api.js`: rotas e regras de negócio
- `data/store.json`: armazenamento local (gerado automaticamente)
- `uploads/`: documentos enviados

## Observações

- Extração automática de texto funciona melhor com `.txt` / `.md`.
- Para `.pdf`/`.docx`, pode ser necessário colar manualmente o texto base na área de “Texto base de requisitos”.
- A geração de PDFs depende do ambiente de navegador do Puppeteer (igual ao restante projeto).
