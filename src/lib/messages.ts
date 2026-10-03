// Mensagens automáticas do sistema (notificações no app e e-mails), editáveis em
// Configurações → Mensagens. Seguro para client e server.
//
// Os textos aceitam variáveis entre chaves — {protocolo}, {nome}… Uma linha que
// usa uma variável vazia é removida (ex.: a linha do comentário, quando não há).

export type Channel = "app" | "email";
type Var = { name: string; desc: string; sample: string };
type TField = { key: string; label: string; kind: "text" | "textarea"; default: string; hint?: string };

export type TemplateDef = {
  key: string;
  group: string;
  label: string;
  audience: string;
  /** Canais que podem ser ligados/desligados. Vazio = e-mail obrigatório (acesso) ou layout. */
  channels: Channel[];
  vars: Var[];
  fields: TField[];
  /** Variáveis que não podem sumir do texto (ex.: a senha no convite). */
  required?: string[];
};

const V = {
  protocolo: { name: "protocolo", desc: "Número da OS", sample: "OS-2026-00012" },
  titulo: { name: "titulo", desc: "Título da OS", sample: "Repintura do hall de entrada" },
  condominio: { name: "condominio", desc: "Nome do condomínio", sample: "Odyssey Residence" },
  autor: { name: "autor", desc: "Quem fez a ação", sample: "Helena Duarte" },
  comentario: { name: "comentario", desc: "Comentário/motivo (quando houver)", sample: "Faltou pintar o rodapé." },
};
const OS_VARS = [V.protocolo, V.titulo, V.condominio, V.autor];

const notification = (key: string, label: string, audience: string, title: string, message: string, vars: Var[] = OS_VARS): TemplateDef => ({
  key,
  group: key.startsWith("os_") || key === "council_request" ? "Ordens de serviço" : key.startsWith("billing") ? "Assinatura" : key.startsWith("checklist") ? "Checklist do zelador" : key.startsWith("maint") ? "Manutenção preventiva" : key.startsWith("assembly") ? "Assembleias" : "Comunicados",
  label,
  audience,
  channels: ["app", "email"],
  vars,
  fields: [
    { key: "title", label: "Título", kind: "text", default: title, hint: "Também é o assunto do e-mail." },
    { key: "message", label: "Mensagem", kind: "textarea", default: message },
  ],
});

export const TEMPLATES: TemplateDef[] = [
  notification("os_created", "Nova OS aberta", "Síndico e zelador", "Nova OS aberta", "{protocolo} · {titulo}"),
  notification("council_request", "Nova solicitação do conselho", "Síndico e zelador", "Nova solicitação do conselho", "{protocolo} · {titulo}"),
  notification("os_assigned", "OS atribuída a um prestador", "Prestador, síndico e zelador", "OS atribuída", "{protocolo} · {titulo} → {prestador}", [...OS_VARS, { name: "prestador", desc: "Prestador escolhido", sample: "Ricardo Lima" }]),
  notification("os_before_media", "Fotos do ANTES anexadas", "Síndico e zelador", "Fotos do ANTES anexadas", "{protocolo} · {titulo}"),
  notification("os_started", "Serviço iniciado", "Síndico e zelador", "OS em andamento", "{protocolo} · {titulo}\n“{comentario}”", [...OS_VARS, V.comentario]),
  notification("os_completed", "Serviço concluído pelo prestador", "Zelador e síndico", "OS concluída — aguardando validação", "{protocolo} · {titulo}"),
  notification("os_validated", "Validada pelo zelador", "Síndico e prestador", "OS validada pelo zelador", "{protocolo} · {titulo}\n“{comentario}”", [...OS_VARS, V.comentario]),
  notification("os_returned", "Devolvida para ajustes", "Síndico e prestador", "OS devolvida para ajustes", "{protocolo} · {titulo}\n“{comentario}”", [...OS_VARS, V.comentario]),
  notification("os_approved", "Serviço aprovado", "Zelador, conselho, prestador e solicitante", "Serviço aprovado", "{protocolo} · {titulo}\n“{comentario}”", [...OS_VARS, V.comentario]),
  notification("os_rejected", "Rejeitada pelo síndico", "Zelador e prestador", "OS rejeitada pelo síndico", "{protocolo} · {titulo}\n“{comentario}”", [...OS_VARS, V.comentario]),
  notification("os_cancelled", "OS cancelada", "Síndico, zelador, prestador e solicitante", "OS cancelada", "{protocolo} · {titulo}\n“{comentario}”", [...OS_VARS, V.comentario]),
  notification("os_comment", "Novo comentário", "Envolvidos na OS", "Novo comentário de {autor}", "{protocolo} · {comentario}", [...OS_VARS, V.comentario]),
  notification("os_admin_update", "OS alterada pela administração", "Síndico, zelador, prestador e solicitante", "OS alterada pela administração", "{protocolo} · {titulo} — {status}", [...OS_VARS, { name: "status", desc: "Novo status", sample: "Em andamento" }]),
  notification("announcement", "Novo comunicado", "Todos do condomínio", "Novo comunicado: {titulo}", "{resumo}", [
    { name: "titulo", desc: "Título do comunicado", sample: "Manutenção da piscina" },
    { name: "resumo", desc: "Início do texto", sample: "A piscina ficará fechada na próxima segunda para limpeza." },
    V.condominio,
    V.autor,
  ]),
  notification("checklist_issue", "Problema encontrado no checklist", "Síndico", "Problema no checklist: {item}", "{autor} marcou “{item}” com problema.\n“{observacao}”\nOS aberta: {protocolo}", [
    { name: "item", desc: "Item do checklist", sample: "Portões e interfones" },
    V.autor,
    { name: "observacao", desc: "Observação (quando houver)", sample: "Interfone do bloco B mudo." },
    { name: "protocolo", desc: "OS aberta (quando houver)", sample: "OS-2026-00015" },
    V.condominio,
  ]),
  notification("checklist_late", "Checklist do dia atrasado", "Síndico e zelador (no horário limite)", "Checklist do dia incompleto", "{pendentes} de {total} itens ainda não foram conferidos hoje (limite {prazo}).", [
    { name: "pendentes", desc: "Itens não conferidos", sample: "3" },
    { name: "total", desc: "Itens do dia", sample: "7" },
    { name: "prazo", desc: "Horário limite", sample: "10:00" },
    V.condominio,
  ]),
  notification("assembly_called", "Convocação de assembleia", "Todos do condomínio (menos prestadores)", "Convocação: {titulo}", "{quando}{local}\nVotação online até {prazo}.", [
    V.condominio,
    { name: "titulo", desc: "Título da assembleia", sample: "Assembleia geral ordinária 2026" },
    { name: "quando", desc: "Data e hora da assembleia", sample: "segunda-feira, 12 de outubro de 2026, às 19:30" },
    { name: "local", desc: "Local (com vírgula na frente, quando houver)", sample: ", no salão de festas" },
    { name: "prazo", desc: "Fim da votação online", sample: "12/10/2026 22:00" },
  ]),
  notification("assembly_closed", "Votação encerrada", "Todos do condomínio (menos prestadores)", "Resultado: {titulo}", "A votação foi encerrada. Veja o resultado de cada item da pauta.", [
    V.condominio,
    { name: "titulo", desc: "Título da assembleia", sample: "Assembleia geral ordinária 2026" },
  ]),
  notification("announcement_delete_request", "Pedido de exclusão de comunicado", "Síndico", "Pedido para excluir: {titulo}", "{autor} pediu para excluir o comunicado.\nMotivo: “{comentario}”\nAprove ou recuse em Comunicados.", [
    V.condominio, V.autor, V.comentario,
    { name: "titulo", desc: "Título do comunicado", sample: "Manutenção dos elevadores" },
  ]),
  notification("announcement_delete_decided", "Pedido de exclusão de comunicado decidido", "Superadmin que pediu", "Exclusão {decisao}: {titulo}", "{autor} {decisao} o pedido de exclusão.\n“{comentario}”", [
    V.condominio, V.autor, V.comentario,
    { name: "titulo", desc: "Título do comunicado", sample: "Manutenção dos elevadores" },
    { name: "decisao", desc: "aprovado ou recusado", sample: "aprovado" },
  ]),
  notification("assembly_change_request", "Pedido de alteração de assembleia", "Síndico", "Pedido para {acao}: {titulo}", "{autor} pediu para {acao} a assembleia. Revise e aprove ou recuse.", [
    V.condominio, V.autor,
    { name: "titulo", desc: "Título da assembleia", sample: "Assembleia geral ordinária 2026" },
    { name: "acao", desc: "editar ou excluir", sample: "editar" },
  ]),
  notification("assembly_change_decided", "Pedido de alteração decidido", "Superadmin que pediu", "Pedido {decisao}: {titulo}", "{autor} {decisao} o pedido.\n“{comentario}”", [
    V.condominio, V.autor, V.comentario,
    { name: "titulo", desc: "Título da assembleia", sample: "Assembleia geral ordinária 2026" },
    { name: "decisao", desc: "aprovado ou recusado", sample: "aprovado" },
  ]),
  notification("assembly_revote", "Votos zerados após alteração da pauta", "Todos do condomínio (menos prestadores)", "Vote de novo: {titulo}", "A pauta mudou e {itens} item(ns) precisa(m) de novo voto até {prazo}.", [
    V.condominio,
    { name: "titulo", desc: "Título da assembleia", sample: "Assembleia geral ordinária 2026" },
    { name: "itens", desc: "Itens com votos zerados", sample: "1" },
    { name: "prazo", desc: "Fim da votação online", sample: "12/10/2026 22:00" },
  ]),
  notification("maint_order", "OS de manutenção preventiva aberta", "Síndico e zelador", "Manutenção preventiva: {titulo}", "{protocolo} · prevista para {vencimento}.", [
    V.protocolo,
    V.titulo,
    V.condominio,
    { name: "vencimento", desc: "Data prevista do serviço", sample: "15/10/2026" },
  ]),
  notification("maint_doc_expiring", "Documento perto de vencer", "Síndico (na antecedência do plano)", "{documento} vence em {dias} dias", "{condominio}: {documento} vence em {vencimento}. Providencie a renovação.", [
    { name: "documento", desc: "Documento ou laudo", sample: "AVCB" },
    { name: "vencimento", desc: "Data de vencimento", sample: "15/10/2026" },
    { name: "dias", desc: "Dias que faltam", sample: "30" },
    V.condominio,
  ]),
  notification("maint_doc_expired", "Documento vencido", "Síndico (no dia do vencimento)", "{documento} venceu", "{condominio}: {documento} venceu em {vencimento}. Depois de renovar, marque como renovado em Manutenção preventiva.", [
    { name: "documento", desc: "Documento ou laudo", sample: "AVCB" },
    { name: "vencimento", desc: "Data de vencimento", sample: "15/10/2026" },
    V.condominio,
  ]),
  notification("billing_payment_failed", "Falha no pagamento", "Síndico e superadmins", "Falha no pagamento da assinatura", "{condominio}: não conseguimos cobrar {valor}. Atualize a forma de pagamento.", [
    V.condominio,
    { name: "valor", desc: "Valor da cobrança", sample: "R$ 200,00" },
  ]),
  {
    key: "invite",
    group: "Acesso",
    label: "Convite com senha provisória",
    audience: "Usuário recém-cadastrado (se ativado em E-mail)",
    channels: [],
    required: ["senha"],
    vars: [
      { name: "nome", desc: "Primeiro nome", sample: "Ana" },
      { name: "perfil", desc: "Perfil de acesso", sample: "Síndico" },
      { name: "email", desc: "E-mail de login", sample: "ana@exemplo.com" },
      { name: "senha", desc: "Senha provisória", sample: "Xk7-pQ2mLr9a" },
    ],
    fields: [
      { key: "subject", label: "Assunto", kind: "text", default: "Seu acesso ao Condtrack" },
      { key: "title", label: "Título", kind: "text", default: "Seu acesso ao Condtrack" },
      { key: "message", label: "Mensagem", kind: "textarea", default: "Olá, {nome}!\nVocê foi cadastrado(a) no Condtrack como {perfil}.\nE-mail: {email}\nSenha provisória: {senha}" },
      { key: "cta", label: "Botão", kind: "text", default: "Entrar no Condtrack" },
      { key: "footnote", label: "Nota de rodapé", kind: "textarea", default: "Por segurança, altere a senha em Meu perfil após o primeiro acesso. Se você não esperava este e-mail, ignore-o." },
    ],
  },
  {
    key: "reset",
    group: "Acesso",
    label: "Senha redefinida",
    audience: "Usuário que teve a senha redefinida",
    channels: [],
    required: ["senha"],
    vars: [
      { name: "nome", desc: "Primeiro nome", sample: "Ana" },
      { name: "email", desc: "E-mail de login", sample: "ana@exemplo.com" },
      { name: "senha", desc: "Nova senha provisória", sample: "Xk7-pQ2mLr9a" },
    ],
    fields: [
      { key: "subject", label: "Assunto", kind: "text", default: "Nova senha de acesso — Condtrack" },
      { key: "title", label: "Título", kind: "text", default: "Sua senha foi redefinida" },
      { key: "message", label: "Mensagem", kind: "textarea", default: "Olá, {nome}!\nA administração redefiniu a sua senha de acesso.\nNova senha provisória: {senha}" },
      { key: "cta", label: "Botão", kind: "text", default: "Entrar no Condtrack" },
      { key: "footnote", label: "Nota de rodapé", kind: "textarea", default: "Por segurança, altere a senha em Meu perfil após o primeiro acesso. Se você não esperava este e-mail, ignore-o." },
    ],
  },
  {
    key: "password_forgot",
    group: "Acesso",
    label: "Esqueci minha senha",
    audience: "Quem pediu para redefinir a senha na tela de login",
    channels: [],
    vars: [
      { name: "nome", desc: "Primeiro nome", sample: "Ana" },
      { name: "validade", desc: "Por quanto tempo o link vale", sample: "1 hora" },
    ],
    fields: [
      { key: "subject", label: "Assunto", kind: "text", default: "Redefinir sua senha — Condtrack" },
      { key: "title", label: "Título", kind: "text", default: "Redefinir sua senha" },
      { key: "message", label: "Mensagem", kind: "textarea", default: "Olá, {nome}!\nRecebemos um pedido para redefinir a senha da sua conta no Condtrack.\nO link abaixo vale por {validade} e pode ser usado uma única vez." },
      { key: "cta", label: "Botão", kind: "text", default: "Criar nova senha" },
      { key: "footnote", label: "Nota de rodapé", kind: "textarea", default: "Se você não pediu a troca, ignore este e-mail: sua senha continua a mesma." },
    ],
  },
  {
    key: "email_changed",
    group: "Acesso",
    label: "E-mail de acesso alterado",
    audience: "Endereço antigo de quem teve o e-mail trocado (aviso de segurança)",
    channels: [],
    vars: [
      { name: "nome", desc: "Primeiro nome", sample: "Ana" },
      { name: "email_antigo", desc: "E-mail anterior", sample: "ana@antigo.com" },
      { name: "email_novo", desc: "Novo e-mail de login", sample: "ana@novo.com" },
      { name: "autor", desc: "Quem fez a troca", sample: "Ana Carvalho" },
    ],
    fields: [
      { key: "subject", label: "Assunto", kind: "text", default: "Seu e-mail de acesso foi alterado — Condtrack" },
      { key: "title", label: "Título", kind: "text", default: "Seu e-mail de acesso foi alterado" },
      { key: "message", label: "Mensagem", kind: "textarea", default: "Olá, {nome}.\nO e-mail de login da sua conta mudou de {email_antigo} para {email_novo}.\nAlteração feita por {autor}." },
      { key: "cta", label: "Botão", kind: "text", default: "Entrar no Condtrack" },
      { key: "footnote", label: "Nota de rodapé", kind: "textarea", default: "Se você não reconhece esta alteração, fale imediatamente com a administração do condomínio." },
    ],
  },
  {
    key: "email_layout",
    group: "Layout dos e-mails",
    label: "Saudação, botões e rodapé",
    audience: "Todos os e-mails de notificação",
    channels: [],
    vars: [{ name: "nome", desc: "Primeiro nome de quem recebe", sample: "Ana" }],
    fields: [
      { key: "greeting", label: "Saudação", kind: "text", default: "Olá, {nome}." },
      { key: "ctaOrder", label: "Botão — ordens de serviço", kind: "text", default: "Ver ordem de serviço" },
      { key: "ctaAnnouncement", label: "Botão — comunicados", kind: "text", default: "Ler comunicado" },
      { key: "ctaBilling", label: "Botão — assinatura", kind: "text", default: "Ver assinatura" },
      { key: "ctaChecklist", label: "Botão — checklist", kind: "text", default: "Ver checklist" },
      { key: "ctaDefault", label: "Botão — demais", kind: "text", default: "Abrir o Condtrack" },
      { key: "footnote", label: "Nota abaixo do botão", kind: "textarea", default: "Você pode acompanhar todas as notificações no sino do Condtrack." },
      { key: "footer", label: "Rodapé", kind: "textarea", default: "Condtrack · Gestão condominial\nVocê recebeu este e-mail por ter acesso ao Condtrack." },
    ],
  },
];

export type TemplateKey = string;
export type TemplateValues = Record<string, string | boolean>;

export const templateDef = (key: string) => TEMPLATES.find((t) => t.key === key);

/** Valores padrão de um modelo (textos + canais ligados). */
export function templateDefaults(t: TemplateDef): TemplateValues {
  const v: TemplateValues = Object.fromEntries(t.fields.map((f) => [f.key, f.default]));
  for (const c of t.channels) v[c] = true;
  return v;
}

export const sampleVars = (t: TemplateDef) => Object.fromEntries(t.vars.map((v) => [v.name, v.sample]));

const VAR_RE = /\{([a-zA-Z_]+)\}/g;
export const usedVars = (text: string) => [...text.matchAll(VAR_RE)].map((m) => m[1]);

/** Substitui {variáveis}; linhas com variável vazia são removidas. */
export function fill(text: string, vars: Record<string, string | number | null | undefined>) {
  return text
    .split("\n")
    .filter((line) => usedVars(line).every((n) => String(vars[n] ?? "").trim() !== ""))
    .map((line) => line.replace(VAR_RE, (_, n) => String(vars[n] ?? "")))
    .join("\n")
    .trim();
}
