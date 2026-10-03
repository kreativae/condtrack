import "server-only";
import { getSettings } from "./settings";

// Termos de Uso e Política de Privacidade (LGPD). Dados da empresa em Configurações → Dados legais.
// Os textos são um modelo inicial: devem ser revisados por um advogado antes do uso comercial.

export type Legal = { companyName: string; cnpj: string; address: string; dpoName: string; dpoEmail: string; forum: string; version: string };

const MISSING = (what: string) => `[${what}]`;

export async function getLegal(): Promise<Legal> {
  const v = await getSettings("legal");
  const str = (k: string, fallback: string) => (typeof v[k] === "string" && (v[k] as string).trim()) || fallback;
  return {
    companyName: str("companyName", MISSING("razão social")),
    cnpj: str("cnpj", MISSING("CNPJ")),
    address: str("address", MISSING("endereço")),
    dpoName: str("dpoName", MISSING("nome do encarregado")),
    dpoEmail: str("dpoEmail", MISSING("e-mail do encarregado")),
    forum: str("forum", MISSING("comarca")),
    version: str("version", "2026-10-03"),
  };
}

/** Versão vigente dos termos: quem aceitou outra versão aceita de novo. */
export async function termsVersion() {
  return (await getLegal()).version;
}

export const fmtVersion = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v);

export type Section = { title: string; body: string[] };

export function termsOfUse(l: Legal): Section[] {
  return [
    { title: "1. Quem somos", body: [`O Condtrack é uma plataforma de gestão condominial oferecida por ${l.companyName}, CNPJ ${l.cnpj}, com sede em ${l.address}.`, "Ao usar a plataforma, você concorda com estes Termos e com a Política de Privacidade."] },
    { title: "2. O que a plataforma faz", body: ["Ordens de serviço com registro de antes e depois, checklist da zeladoria, manutenção preventiva, financeiro e orçamento, relatórios, comunicados, assembleias com votação online e notificações.", "O condomínio (por meio do síndico ou da administração) decide quem tem acesso e com qual perfil."] },
    { title: "3. Sua conta", body: ["A conta é pessoal e intransferível. Guarde sua senha e, se possível, ative a verificação em duas etapas.", "Avise a administração do condomínio se perceber uso indevido da sua conta.", "Cada ação importante fica registrada (quem fez, quando e de onde), para a prestação de contas do condomínio."] },
    { title: "4. Uso correto", body: ["Use a plataforma só para a gestão do condomínio. Não envie conteúdo ilegal, ofensivo ou que exponha a intimidade de terceiros, e não tente acessar dados de outros condomínios ou de outras pessoas.", "Fotos e vídeos das ordens de serviço devem mostrar o serviço, evitando pessoas e placas de veículos sempre que possível."] },
    { title: "5. Responsabilidades", body: ["O condomínio é responsável pelas informações que cadastra (pessoas, lançamentos, comunicados, pautas) e pelas decisões tomadas com elas.", "As assembleias online seguem a Lei 14.309/2022 e a convenção do condomínio; cabe ao condomínio verificar se a convenção permite e cumprir os prazos de convocação.", "Trabalhamos para manter a plataforma disponível e segura, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros (hospedagem, internet)."] },
    { title: "6. Assinatura", body: ["O uso pelo condomínio depende de assinatura ativa, nas condições do plano contratado. O cancelamento interrompe a cobrança no fim do período pago."] },
    { title: "7. Fim do uso", body: ["Quando um condomínio deixa a plataforma, os dados ficam guardados pelo prazo necessário para obrigações legais e prestação de contas, e depois são eliminados, salvo pedido diferente do condomínio."] },
    { title: "8. Mudanças nestes Termos", body: ["Podemos atualizar estes Termos. Quando isso acontecer, pediremos um novo aceite no próximo acesso."] },
    { title: "9. Foro", body: [`Fica eleito o foro da comarca de ${l.forum} para resolver questões sobre estes Termos, respeitados os direitos do consumidor.`] },
  ];
}

export function privacyPolicy(l: Legal): Section[] {
  return [
    { title: "1. Quem trata seus dados", body: [
      `Os dados dos moradores, funcionários e prestadores de cada condomínio são tratados em nome do condomínio, que é o controlador; ${l.companyName} atua como operadora, seguindo as instruções do condomínio.`,
      `Para os dados da sua conta na plataforma (login, segurança, suporte), ${l.companyName} (CNPJ ${l.cnpj}) é a controladora.`,
      `Encarregado de dados (DPO): ${l.dpoName}, ${l.dpoEmail}.`,
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
      `Para outros pedidos, escreva para ${l.dpoEmail}. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
    ] },
    { title: "7. Segurança", body: [
      "Conexões criptografadas, senhas guardadas com hash, segredos cifrados, verificação em duas etapas, bloqueio após tentativas erradas e registro das ações importantes.",
    ] },
    { title: "8. Cookies", body: [
      "Usamos apenas cookies necessários: sessão de login, tema claro ou escuro, condomínio em foco e atalhos do menu no celular. Não usamos cookies de publicidade.",
    ] },
    { title: "9. Mudanças nesta Política", body: ["Quando esta Política mudar, pediremos um novo aceite no próximo acesso."] },
  ];
}
