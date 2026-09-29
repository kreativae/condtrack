@AGENTS.md

# Condtrack: contexto para retomar o trabalho

Leia o `README.md` para produto, stack, perfis, fluxo da OS e deploy. Este arquivo guarda o que o README não diz:
como trabalhamos, o que não pode quebrar e onde cada coisa mora. Atualize-o junto com mudanças que alterem essas regras.

## Como trabalhamos

- Tudo em português (textos da UI, commits, comentários). Commits descrevem a funcionalidade: `Área: o que mudou`.
- Trabalho direto na `main`; a Vercel publica cada push em produção. **Pergunte antes de dar push.**
- Um commit por ajuste, com push logo em seguida, para nada ficar preso numa máquina só.
- Se um build falhar na Vercel, o site continua na versão anterior; corrija na `main`.
- Ponto de restauração: tag `v1-estavel` (2026-09-28, com a aba Aparência já testada no ar). Para voltar um arquivo: `git checkout v1-estavel -- caminho`.
- O Mac principal pode não ter Node/npm: sem `npm run build` local, o build da Vercel é a verificação. Escreva com cuidado
  e revise o diff antes de commitar.

## Regras que não podem quebrar

- **Permissões**: toda transição e visibilidade de OS passa por `can()` / `canView()` em `src/lib/workflow.ts`. Server actions
  checam de novo com `requireUser(...)`; a UI nunca é a única barreira.
- **Fluxo da OS**: open → assigned → in_progress (exige ANTES) → completed (exige DEPOIS) → validated (zelador) → approved (síndico, vai ao feed).
  Rejeição volta ao prestador com motivo.
- **Morador (`resident`) é somente leitura.**
- **Auditoria**: ações críticas chamam `audit()` (`src/lib/audit.ts`), inclusive no modo "visualizar como".
- **Mídias**: fotos sem marca d'água; os dados de captura (data, GPS, aparelho) ficam só nos metadados da OS.
- **Segredos** em `Setting` são cifrados (AES-256-GCM). Conteúdo público (login, aparência) é JSON puro.

## Onde mora cada coisa (além do README)

- **Cores**: tudo usa variáveis CSS (`--brand`, `--surface`, `--fg`…) de `src/app/globals.css`, expostas ao Tailwind
  como `bg-surface`, `text-brand` etc. **Não use cores fixas** (`#hex`, `bg-slate-*`) em componentes: elas ignoram a aba Aparência.
- **Configurações → Aparência** (`?aba=aparencia`): cores do sistema nos temas claro e escuro. `src/lib/theme-appearance.ts`
  (padrões, derivações, contraste) + `theme-appearance-server.ts`; o layout raiz injeta só as variáveis alteradas.
  `THEME_DEFAULTS` deve bater com `:root` em `globals.css`.
- **Configurações → Página de login**: `src/lib/login-appearance*.ts`. A cor própria do login tem prioridade sobre a Aparência.
- **Configurações → Mensagens**: modelos de notificação e e-mail em `src/lib/messages*.ts`, com histórico de envios.
- **Checklist do zelador**: `src/lib/checklist*.ts`, `src/app/actions/checklist.ts`, `src/app/api/cron/checklist`.
- **Next.js 16**: `src/proxy.ts` (antigo middleware); veja o aviso em `AGENTS.md`.

## Histórico recente

- 2026-09-23 a 25: MVP, Neon + Vercel + Blob, condomínios horizontais, feed com vídeo, configurações de login e mensagens,
  troca de e-mail, visualizador de fotos e metadados, checklist do zelador.
- 2026-09-28: aba Aparência (cores de todas as páginas).
