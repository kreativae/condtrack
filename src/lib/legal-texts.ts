// Textos da LGPD editáveis em Configurações → Dados legais (Setting público `legal_texts`, JSON puro).
// Sem "server-only": o editor usa os padrões no navegador. Variáveis entre chaves puxam os dados legais.

export type Section = { title: string; body: string[] };

export type LegalMessages = {
  acceptTitleNew: string;
  acceptIntroNew: string;
  acceptTitleUpdate: string;
  acceptIntroUpdate: string;
  acceptBullets: string;
  profileIntro: string;
  deletionWarning: string;
  deletionDone: string;
  deletionPending: string;
};

export type LegalTexts = { terms: Section[]; privacy: Section[]; messages: LegalMessages };

export const LEGAL_TEXTS_KEY = "legal_texts";

/** Variáveis aceitas nos textos (a chave é o que se escreve entre chaves). */
export const LEGAL_VARS = [
  { key: "empresa", label: "Razão social" },
  { key: "cnpj", label: "CNPJ" },
  { key: "endereco", label: "Endereço" },
  { key: "encarregado", label: "Encarregado (DPO)" },
  { key: "email_encarregado", label: "E-mail do encarregado" },
  { key: "foro", label: "Foro" },
] as const;

export const MESSAGE_FIELDS: { key: keyof LegalMessages; label: string; hint?: string; rows?: number }[] = [
  { key: "acceptTitleNew", label: "Aceite: título no primeiro acesso" },
  { key: "acceptIntroNew", label: "Aceite: texto no primeiro acesso", hint: "{nome} = primeiro nome da pessoa.", rows: 2 },
  { key: "acceptTitleUpdate", label: "Aceite: título quando os termos mudam" },
  { key: "acceptIntroUpdate", label: "Aceite: texto quando os termos mudam", rows: 2 },
  { key: "acceptBullets", label: "Aceite: resumo em tópicos", hint: "Um tópico por linha.", rows: 5 },
  { key: "profileIntro", label: "Meu perfil: texto do cartão Privacidade", hint: "Aparece antes dos links para os documentos.", rows: 2 },
  { key: "deletionWarning", label: "Meu perfil: aviso antes de pedir a exclusão", rows: 3 },
  { key: "deletionDone", label: "Meu perfil: confirmação do pedido de exclusão", rows: 2 },
  { key: "deletionPending", label: "Meu perfil: pedido de exclusão em andamento", hint: "{data} = dia do pedido.", rows: 2 },
];

export const DEFAULT_MESSAGES: LegalMessages = {
  acceptTitleNew: "Antes de começar",
  acceptIntroNew: "Olá, {nome}. Para usar o Condtrack, leia e aceite os Termos de Uso e a Política de Privacidade.",
  acceptTitleUpdate: "Atualizamos os termos",
  acceptIntroUpdate: "Os Termos de Uso e a Política de Privacidade mudaram. Leia e confirme para continuar.",
  acceptBullets: [
    "Seus dados são usados para a gestão do condomínio e para a prestação de contas aos moradores.",
    "Fotos dos serviços guardam data, hora e local de captura nos registros da OS.",
    "Você pode baixar seus dados ou pedir a exclusão da conta em Meu perfil.",
    "Não vendemos dados e não usamos cookies de publicidade.",
  ].join("\n"),
  profileIntro: "",
  deletionWarning: "A conta deixa de existir e você perde o acesso. Registros necessários à prestação de contas do condomínio (por exemplo, quem aprovou um serviço ou um lançamento) podem ser mantidos, como a lei permite.",
  deletionDone: "Pedido registrado. A administração vai concluir a exclusão e avisar você.",
  deletionPending: "Você pediu a exclusão da conta em {data}. A administração vai concluir e avisar você.",
};

export const DEFAULT_TERMS: Section[] = [
  { title: "1. Quem somos", body: ["O Condtrack é uma plataforma de gestão condominial oferecida por {empresa}, CNPJ {cnpj}, com sede em {endereco}.", "Ao usar a plataforma, você concorda com estes Termos e com a Política de Privacidade."] },
  { title: "2. O que a plataforma faz", body: ["Ordens de serviço com registro de antes e depois, checklist da zeladoria, manutenção preventiva, financeiro e orçamento, relatórios, comunicados, assembleias com votação online e notificações.", "O condomínio (por meio do síndico ou da administração) decide quem tem acesso e com qual perfil."] },
  { title: "3. Sua conta", body: ["A conta é pessoal e intransferível. Guarde sua senha e, se possível, ative a verificação em duas etapas.", "Avise a administração do condomínio se perceber uso indevido da sua conta.", "Cada ação importante fica registrada (quem fez, quando e de onde), para a prestação de contas do condomínio."] },
  { title: "4. Uso correto", body: ["Use a plataforma só para a gestão do condomínio. Não envie conteúdo ilegal, ofensivo ou que exponha a intimidade de terceiros, e não tente acessar dados de outros condomínios ou de outras pessoas.", "Fotos e vídeos das ordens de serviço devem mostrar o serviço, evitando pessoas e placas de veículos sempre que possível."] },
  { title: "5. Responsabilidades", body: ["O condomínio é responsável pelas informações que cadastra (pessoas, lançamentos, comunicados, pautas) e pelas decisões tomadas com elas.", "As assembleias online seguem a Lei 14.309/2022 e a convenção do condomínio; cabe ao condomínio verificar se a convenção permite e cumprir os prazos de convocação.", "Trabalhamos para manter a plataforma disponível e segura, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros (hospedagem, internet)."] },
  { title: "6. Assinatura", body: ["O uso pelo condomínio depende de assinatura ativa, nas condições do plano contratado. O cancelamento interrompe a cobrança no fim do período pago."] },
  { title: "7. Fim do uso", body: ["Quando um condomínio deixa a plataforma, os dados ficam guardados pelo prazo necessário para obrigações legais e prestação de contas, e depois são eliminados, salvo pedido diferente do condomínio."] },
  { title: "8. Mudanças nestes Termos", body: ["Podemos atualizar estes Termos. Quando isso acontecer, pediremos um novo aceite no próximo acesso."] },
  { title: "9. Foro", body: ["Fica eleito o foro da comarca de {foro} para resolver questões sobre estes Termos, respeitados os direitos do consumidor."] },
];

export const DEFAULT_PRIVACY: Section[] = [
  { title: "1. Quem trata seus dados", body: [
    "Os dados dos moradores, funcionários e prestadores de cada condomínio são tratados em nome do condomínio, que é o controlador; {empresa} atua como operadora, seguindo as instruções do condomínio.",
    "Para os dados da sua conta na plataforma (login, segurança, suporte), {empresa} (CNPJ {cnpj}) é a controladora.",
    "Encarregado de dados (DPO): {encarregado}, {email_encarregado}.",
  ] },
  { title: "2. Quais dados", body: [
    "Cadastro: nome, e-mail, telefone, CPF (quando informado), unidade e perfil no condomínio.",
    "Uso: ordens de serviço, comentários, votos em assembleia, leituras de comunicados, conferências do checklist e lançamentos financeiros feitos por você.",
    "Fotos e vídeos dos serviços, com data, hora, localização (quando o aparelho permite) e modelo do aparelho, guardados nos registros da OS.",
    "Segurança: registros de acesso (data, hora, endereço IP e navegador), exigidos pelo Marco Civil da Internet, e dados da verificação em duas etapas e da biometria (a biometria fica só no seu aparelho; a plataforma recebe apenas uma chave pública).",
  ] },
  { title: "3. Para que usamos", body: [
    "Prestar o serviço contratado pelo condomínio (execução de contrato e legítimo interesse do condomínio na sua gestão).",
    "Prestação de contas e transparência (registros de auditoria e histórico do financeiro).",
    "Segurança da conta e prevenção a fraudes (legítimo interesse).",
    "Cumprir obrigações legais, como a guarda de registros de acesso por 6 meses.",
    "Avisos sobre o condomínio por notificação, e-mail e celular, conforme as preferências ativadas.",
  ] },
  { title: "4. Com quem compartilhamos", body: [
    "Com as pessoas do seu condomínio, conforme o perfil de cada uma (por exemplo, o síndico vê as ordens de serviço; o morador vê só os serviços aprovados).",
    "Com fornecedores que operam a plataforma: hospedagem e armazenamento de arquivos (Vercel), banco de dados (Neon), envio de e-mails, pagamentos (Stripe) e entrega de notificações no celular (Apple, Google, Mozilla, Microsoft).",
    "Alguns desses fornecedores mantêm servidores fora do Brasil; a transferência segue o art. 33 da LGPD, com contratos e garantias de proteção.",
    "Não vendemos dados pessoais.",
  ] },
  { title: "5. Por quanto tempo", body: [
    "Enquanto a conta e o condomínio estiverem ativos. Depois, pelo prazo necessário para obrigações legais e para a prestação de contas do condomínio (por exemplo, documentos financeiros), e então os dados são eliminados ou anonimizados.",
  ] },
  { title: "6. Seus direitos", body: [
    "Pela LGPD (art. 18), você pode confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir a portabilidade, a anonimização ou a eliminação, e saber com quem foram compartilhados.",
    "Em Meu perfil → Privacidade, você baixa uma cópia dos seus dados e pode pedir a exclusão da conta. Registros necessários à prestação de contas do condomínio e a obrigações legais podem ser mantidos.",
    "Para outros pedidos, escreva para {email_encarregado}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).",
  ] },
  { title: "7. Segurança", body: [
    "Conexões criptografadas, senhas guardadas com hash, segredos cifrados, verificação em duas etapas, bloqueio após tentativas erradas e registro das ações importantes.",
  ] },
  { title: "8. Cookies", body: [
    "Usamos apenas cookies necessários: sessão de login, tema claro ou escuro, condomínio em foco e atalhos do menu no celular. Não usamos cookies de publicidade.",
  ] },
  { title: "9. Mudanças nesta Política", body: ["Quando esta Política mudar, pediremos um novo aceite no próximo acesso."] },
];

export const DEFAULT_LEGAL_TEXTS: LegalTexts = { terms: DEFAULT_TERMS, privacy: DEFAULT_PRIVACY, messages: DEFAULT_MESSAGES };

/** Troca {variavel} pelo valor; variáveis desconhecidas ficam como estão. */
export function fillVars(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

const MAX_SECTIONS = 40;
const MAX_TEXT = 5000;

/** Limpa seções vindas do editor (ou do banco); devolve null se o formato não servir. */
export function cleanSections(v: unknown): Section[] | null {
  if (!Array.isArray(v)) return null;
  const out: Section[] = [];
  for (const s of v.slice(0, MAX_SECTIONS)) {
    if (!s || typeof s !== "object") return null;
    const title = typeof s.title === "string" ? s.title.trim().slice(0, 200) : "";
    const body = Array.isArray(s.body) ? s.body.filter((p: unknown): p is string => typeof p === "string").map((p: string) => p.trim().slice(0, MAX_TEXT)).filter(Boolean) : [];
    if (title || body.length) out.push({ title, body });
  }
  return out;
}

export function cleanMessages(v: unknown): Partial<LegalMessages> {
  if (!v || typeof v !== "object") return {};
  const out: Partial<LegalMessages> = {};
  for (const f of MESSAGE_FIELDS) {
    const x = (v as Record<string, unknown>)[f.key];
    if (typeof x === "string") out[f.key] = x.trim().slice(0, MAX_TEXT);
  }
  return out;
}
