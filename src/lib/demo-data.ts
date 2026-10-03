// Bancos de dados fictícios do condomínio de demonstração e o sorteio de cada geração.
// Cada demonstração sai diferente: nome, cidade, pessoas, empresas, OS, valores e pautas.

/** Gerador aleatório com semente (mulberry32): a mesma semente repete a mesma demonstração. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)];
  const shuffle = <T,>(list: readonly T[]) => {
    const a2 = [...list];
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  /** Valor com variação de ±pct (ex.: 0.1 = ±10%). */
  const vary = (value: number, pct: number) => Math.round(value * (1 + (next() * 2 - 1) * pct));
  /** Índice sorteado conforme os pesos (somam 1). */
  const weighted = (weights: number[]) => {
    const r = next();
    let acc = 0;
    const i = weights.findIndex((w) => (acc += w) > r);
    return i < 0 ? weights.length - 1 : i;
  };
  return { next, int, pick, shuffle, vary, weighted };
}
export type Rng = ReturnType<typeof rng>;

export const CONDO_NAMES = [
  "Residencial Vila das Acácias", "Residencial Jardim das Palmeiras", "Condomínio Parque dos Ipês", "Residencial Solar das Orquídeas",
  "Condomínio Mirante do Lago", "Residencial Bosque dos Jequitibás", "Condomínio Village Primavera", "Edifício Monte Azul",
  "Residencial Recanto das Araucárias", "Condomínio Torres do Atlântico", "Residencial Alto da Serra", "Edifício Porto Belo",
  "Condomínio Quinta das Hortênsias", "Residencial Vista Verde", "Edifício Aurora Boreal", "Condomínio Reserva dos Pinheiros",
  "Residencial Costa Dourada", "Edifício Maison Lumière", "Condomínio Jardins de Provence", "Residencial Ilha Bela",
];

export const CITIES: { city: string; uf: string; ddd: string; streets: string[] }[] = [
  { city: "Curitiba", uf: "PR", ddd: "41", streets: ["Rua das Acácias", "Av. Sete de Setembro", "Rua Itupava", "Rua Mateus Leme"] },
  { city: "Florianópolis", uf: "SC", ddd: "48", streets: ["Rua Bocaiúva", "Av. Beira-Mar Norte", "Rua Lauro Linhares", "Rua Esteves Júnior"] },
  { city: "Belo Horizonte", uf: "MG", ddd: "31", streets: ["Rua Pernambuco", "Av. do Contorno", "Rua Grão Mogol", "Rua Rio Grande do Norte"] },
  { city: "Campinas", uf: "SP", ddd: "19", streets: ["Av. Norte-Sul", "Rua Barão de Jaguara", "Rua Coronel Quirino", "Av. José de Souza Campos"] },
  { city: "Porto Alegre", uf: "RS", ddd: "51", streets: ["Rua Padre Chagas", "Av. Carlos Gomes", "Rua Mostardeiro", "Rua Dona Laura"] },
  { city: "Goiânia", uf: "GO", ddd: "62", streets: ["Av. T-63", "Rua 9", "Av. 85", "Rua T-37"] },
  { city: "Recife", uf: "PE", ddd: "81", streets: ["Av. Boa Viagem", "Rua da Hora", "Rua Setúbal", "Av. Rui Barbosa"] },
  { city: "Salvador", uf: "BA", ddd: "71", streets: ["Av. Oceânica", "Rua Marquês de Leão", "Av. Paulo VI", "Rua Rio de Janeiro"] },
  { city: "São Paulo", uf: "SP", ddd: "11", streets: ["Rua Oscar Freire", "Rua Augusta", "Av. Pompeia", "Rua Afonso Brás"] },
  { city: "Rio de Janeiro", uf: "RJ", ddd: "21", streets: ["Rua Voluntários da Pátria", "Av. das Américas", "Rua Barata Ribeiro", "Rua Conde de Bonfim"] },
  { city: "Vitória", uf: "ES", ddd: "27", streets: ["Av. Saturnino de Brito", "Rua Chapot Presvot", "Av. Reta da Penha"] },
  { city: "Fortaleza", uf: "CE", ddd: "85", streets: ["Av. Beira Mar", "Rua Silva Paulet", "Av. Santos Dumont"] },
];

export const TOWER_PAIRS: [string, string][] = [
  ["Torre Ipê", "Torre Jacarandá"], ["Bloco A", "Bloco B"], ["Torre Norte", "Torre Sul"], ["Edifício Aurora", "Edifício Horizonte"],
  ["Torre Jasmim", "Torre Lírio"], ["Bloco Mar", "Bloco Sol"], ["Torre Cedro", "Torre Carvalho"], ["Torre Safira", "Torre Esmeralda"],
];

export const ACCENTS = ["#0E9384", "#5B5BD6", "#D97706", "#0F766E", "#7C3AED", "#2563EB", "#BE185D", "#15803D", "#B45309", "#0369A1"];

export const FIRST_F = ["Ana", "Beatriz", "Camila", "Daniela", "Fernanda", "Gabriela", "Helena", "Isabela", "Juliana", "Larissa", "Mariana", "Natália", "Patrícia", "Renata", "Sofia", "Tatiane", "Vanessa", "Yasmin"];
export const FIRST_M = ["André", "Bruno", "Carlos", "Diego", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor", "João", "Lucas", "Marcelo", "Nelson", "Otávio", "Paulo", "Rafael", "Sebastião", "Thiago", "Vinícius"];
export const SURNAMES = ["Almeida", "Antunes", "Barbosa", "Batista", "Cardoso", "Castro", "Dias", "Duarte", "Farias", "Ferraz", "Freitas", "Gomes", "Lemos", "Lima", "Machado", "Martins", "Moreira", "Nogueira", "Prado", "Queiroz", "Ramos", "Rocha", "Sales", "Siqueira", "Teixeira", "Vieira"];

/** Tipos de prestador: quem atende cada categoria de OS. */
export const PROVIDER_KINDS = {
  geral: { specialty: "Manutenção geral", suffixes: ["Reformas", "Manutenção Predial", "Serviços Gerais", "Pinturas e Reformas"], cats: ["Pintura", "Jardinagem", "Limpeza", "Serralheria"] },
  eletrica: { specialty: "Elétrica", suffixes: ["Elétrica", "Instalações Elétricas", "Eletro Serviços"], cats: ["Elétrica", "Elevadores"] },
  hidraulica: { specialty: "Hidráulica", suffixes: ["Hidráulica", "Encanamentos", "Soluções Hidráulicas"], cats: ["Hidráulica"] },
} as const;
export type ProviderKind = keyof typeof PROVIDER_KINDS;

/**
 * Modelos de OS. {T1}/{T2} = nomes das torres. area = área comum; unit = OS de unidade.
 * report = relatório do prestador quando concluída.
 */
export const ORDER_POOL: { title: string; desc: string; cat: string; area?: string; unit?: true; report: string }[] = [
  { title: "Pintura da garagem: faixas e pilares", desc: "Faixas apagadas e pilares com marcas de batidas.", cat: "Pintura", area: "Garagem", report: "Pilares lixados e pintados; faixas refeitas com tinta de demarcação." },
  { title: "Troca do quadro de comando da bomba", desc: "Bomba de recalque desarmando à noite.", cat: "Elétrica", report: "Quadro substituído e relé térmico ajustado." },
  { title: "Vazamento na prumada da {T1}", desc: "Infiltração no 3º andar, próximo ao shaft.", cat: "Hidráulica", report: "Trecho de tubulação trocado e parede recomposta." },
  { title: "Poda das árvores do estacionamento", desc: "Galhos encostando nos carros.", cat: "Jardinagem", report: "Poda de condução nas árvores e limpeza do local." },
  { title: "Revisão do portão social", desc: "Fechadura eletromagnética falhando.", cat: "Serralheria", area: "Hall de entrada", report: "Eletroímã substituído e fonte revisada." },
  { title: "Repintura do salão de festas", desc: "Paredes manchadas após eventos.", cat: "Pintura", area: "Salão de festas", report: "Duas demãos de tinta acrílica acetinada." },
  { title: "Limpeza das calhas", desc: "Calhas entupidas antes do período de chuvas.", cat: "Limpeza", report: "Calhas e condutores desobstruídos." },
  { title: "Luminárias do playground", desc: "Três postes sem iluminação.", cat: "Elétrica", area: "Playground", report: "Reatores trocados por drivers LED." },
  { title: "Rejunte da piscina", desc: "Rejunte soltando na borda.", cat: "Limpeza", area: "Piscina", report: "Rejunte epóxi refeito em toda a borda." },
  { title: "Pintura do muro frontal", desc: "Pichação no muro da entrada.", cat: "Pintura", report: "Limpeza e repintura do muro." },
  { title: "Torneira da churrasqueira pingando", desc: "Torneira com vazamento constante.", cat: "Hidráulica", area: "Churrasqueira", report: "Reparo trocado e vedação refeita." },
  { title: "Elevador da {T2} com ruído", desc: "Ruído metálico entre o 5º e o 6º andar.", cat: "Elevadores", report: "Polias e guias lubrificadas; cabo de tração ajustado." },
  { title: "Tomadas da academia sem energia", desc: "Bancada das esteiras sem energia.", cat: "Elétrica", area: "Academia", report: "Disjuntor e tomadas trocados; circuito separado para as esteiras." },
  { title: "Cerca viva do playground", desc: "Cerca viva alta, tampando a visão.", cat: "Jardinagem", area: "Playground", report: "Cerca viva podada e adubada." },
  { title: "Infiltração no teto do banheiro", desc: "Mancha crescendo no teto do banheiro social.", cat: "Hidráulica", unit: true, report: "Ralo da unidade de cima vedado e teto repintado." },
  { title: "Lâmpadas queimadas no hall da {T1}", desc: "Duas lâmpadas do hall apagadas.", cat: "Elétrica", area: "Hall de entrada", report: "Lâmpadas trocadas por LED." },
  { title: "Grade da piscina enferrujada", desc: "Ferrugem na grade de proteção.", cat: "Serralheria", area: "Piscina", report: "Lixamento e pintura com zarcão." },
  { title: "Limpeza dos vidros da fachada", desc: "Vidros do hall muito sujos.", cat: "Limpeza", area: "Hall de entrada", report: "Vidros limpos com equipamento de altura." },
  { title: "Interfone da {T2} mudo", desc: "Interfone da portaria não chama os apartamentos do 4º andar.", cat: "Elétrica", report: "Cabo do prumo refeito e central reconfigurada." },
  { title: "Porta corta-fogo travando", desc: "A porta da escada da {T1} não fecha sozinha.", cat: "Serralheria", report: "Mola aérea substituída e dobradiças reguladas." },
  { title: "Vazamento no registro da garagem", desc: "Água escorrendo perto das vagas 20 a 24.", cat: "Hidráulica", area: "Garagem", report: "Registro geral trocado." },
  { title: "Jardim da entrada sem irrigação", desc: "Aspersores não ligam no horário programado.", cat: "Jardinagem", report: "Programador e válvula solenoide trocados." },
  { title: "Descascamento no corredor do 7º andar", desc: "Pintura descascando perto da janela.", cat: "Pintura", report: "Massa corrida e pintura do trecho." },
  { title: "Bomba da piscina fazendo barulho", desc: "Ruído forte durante a filtragem.", cat: "Hidráulica", area: "Piscina", report: "Rolamentos da bomba substituídos." },
  { title: "Sensor de presença da escada", desc: "Luzes da escada não acendem no 2º andar.", cat: "Elétrica", report: "Sensores de presença trocados." },
  { title: "Limpeza da caixa de gordura", desc: "Mau cheiro perto da churrasqueira.", cat: "Limpeza", area: "Churrasqueira", report: "Caixa de gordura esgotada e higienizada." },
  { title: "Corrimão solto na rampa", desc: "Corrimão da rampa de acesso balançando.", cat: "Serralheria", area: "Hall de entrada", report: "Corrimão fixado com novas buchas químicas." },
  { title: "Pintura das vagas de visitantes", desc: "Numeração das vagas apagada.", cat: "Pintura", area: "Garagem", report: "Vagas renumeradas." },
];

/** Status de cada OS sorteada (a ordem segue a linha do tempo: as mais antigas são as aprovadas). */
export const ORDER_STATUSES = [
  "approved", "approved", "approved", "approved", "approved", "approved", "approved", "approved", "approved",
  "cancelled", "rejected", "validated", "completed", "in_progress", "assigned", "assigned", "open", "open",
] as const;

export const RATING_COMMENTS: Record<number, string[]> = {
  5: ["Excelente acabamento.", "Ficou ótimo, muito caprichado.", "Rápido e limpo. Recomendo.", "Garagem ficou outra."],
  4: ["Resolvido, mas demorou um pouco.", "Bom serviço, faltou recolher o entulho.", "Ficou bom."],
  3: ["Resolveu, mas precisou voltar duas vezes."],
};

export const CHECKLIST_ISSUES = [
  "Lâmpada queimada perto da vaga 14.", "Bomba 2 com ruído; acompanhando.", "Interfone do bloco B sem áudio.", "Extintor do 3º andar com lacre rompido.",
  "Portão da garagem demorando para fechar.", "Cloro abaixo do ideal; reposto.", "Vazamento pequeno no registro do hall.", "Balanço do playground com corrente solta.",
];

export const CHECKLIST_NOTES = [
  "Entrega de material de limpeza recebida.", "Morador do 304 avisou barulho na casa de máquinas.", "Piscina com movimento alto no fim de semana.",
  "Portão da garagem revisado pela manhã.", "Coleta seletiva remarcada para quinta.", "Técnico do elevador fez a visita mensal.",
  "Encomendas grandes guardadas na sala da administração.", "Reunião rápida com a portaria sobre o novo controle de visitantes.",
];

/** Fornecedores sorteados por categoria de despesa. */
export const VENDORS: Record<string, string[]> = {
  Elevadores: ["Ascensus Elevadores", "Atlas Conservadora", "Vertical Elevadores"],
  Limpeza: ["Clean Max Serviços", "Brilho Total Limpeza", "Higiene Prime"],
  "Portaria e segurança": ["Sentinela Segurança", "Guardião Serviços", "Vigilância Alfa"],
  Administradora: ["Gestão Sul Administradora", "Condomínio Fácil Adm.", "Prime Gestão Condominial"],
  Seguros: ["Seguradora Horizonte", "Porto Forte Seguros", "Aliança Seguros"],
  Energia: ["Distribuidora de energia"],
  Água: ["Companhia de saneamento"],
};

/** Despesas avulsas sorteadas ao longo dos meses (valores-base em centavos, para 64 unidades). */
export const ONE_OFF_EXPENSES: { cat: string; desc: string; cents: number }[] = [
  { cat: "Obras e reformas", desc: "Repintura do salão de festas", cents: 1_150_000 },
  { cat: "Piscina", desc: "Rejunte e tratamento da piscina", cents: 380_000 },
  { cat: "Manutenção", desc: "Reparo do elevador", cents: 640_000 },
  { cat: "Jardinagem", desc: "Paisagismo da entrada", cents: 290_000 },
  { cat: "Materiais", desc: "Lâmpadas LED para as áreas comuns", cents: 185_000 },
  { cat: "Manutenção", desc: "Troca do motor do portão da garagem", cents: 470_000 },
  { cat: "Obras e reformas", desc: "Impermeabilização da laje", cents: 2_200_000 },
  { cat: "Materiais", desc: "Produtos de limpeza do semestre", cents: 140_000 },
];

export const ASSEMBLY_PAST: { title: string; items: { title: string; options?: string[] }[] }[] = [
  { title: "Assembleia geral ordinária", items: [{ title: "Aprovação das contas do 1º semestre" }, { title: "Repintura da fachada (orçamento de R$ 180.000 em 6 parcelas)" }, { title: "Escolha da empresa de portaria", options: ["Sentinela Segurança", "Guardião Serviços", "Manter a atual"] }] },
  { title: "Assembleia geral ordinária", items: [{ title: "Prestação de contas do exercício" }, { title: "Previsão orçamentária e reajuste de 6% na taxa" }, { title: "Eleição do conselho fiscal", options: ["Chapa 1", "Chapa 2"] }] },
  { title: "Assembleia geral ordinária", items: [{ title: "Aprovação das contas do semestre" }, { title: "Instalação de câmeras nas áreas comuns" }, { title: "Horário da piscina no verão", options: ["8h às 22h", "9h às 21h", "Manter o atual"] }] },
];

export const ASSEMBLY_NEXT: { title: string; item: string; desc: string }[] = [
  { title: "Assembleia geral extraordinária: elevadores", item: "Modernização dos elevadores da {T2}", desc: "Proposta da conservadora: R$ 240.000, com rateio extra em 10 meses." },
  { title: "Assembleia geral extraordinária: energia solar", item: "Instalação de placas solares nas áreas comuns", desc: "Economia estimada de 35% na conta de energia; investimento de R$ 160.000." },
  { title: "Assembleia geral extraordinária: portaria remota", item: "Troca da portaria presencial pela remota", desc: "Redução de custo de cerca de R$ 7.000 por mês." },
  { title: "Assembleia geral extraordinária: playground", item: "Reforma completa do playground", desc: "Piso emborrachado e brinquedos novos: R$ 85.000 do fundo de reserva." },
];

export const ANNOUNCEMENTS: { title: string; content: string; category: string; priority?: string }[] = [
  { title: "Manutenção dos elevadores", content: "O elevador da {T2} ficará parado na quinta-feira, das 9h às 12h, para manutenção.", category: "maintenance" },
  { title: "Coleta seletiva", content: "A coleta de recicláveis passa a ser às terças e quintas.", category: "general" },
  { title: "Dedetização nas áreas comuns", content: "Sábado, das 8h às 12h. Mantenha pets longe dos jardins nesse período.", category: "maintenance" },
  { title: "Uso da piscina", content: "Lembramos que o uso da piscina é permitido até as 22h e exige exame médico em dia.", category: "rules" },
  { title: "Falta de água programada", content: "A companhia de saneamento fará reparos na rede na terça, das 8h às 14h.", category: "urgent", priority: "high" },
  { title: "Festa junina do condomínio", content: "Sábado, no salão de festas, a partir das 18h. Traga um prato típico!", category: "event" },
  { title: "Novo controle de acesso", content: "A partir do dia 1º, visitantes serão cadastrados pelo aplicativo da portaria.", category: "general" },
  { title: "Obras na garagem", content: "As vagas da {T1} serão repintadas na próxima semana. Siga as orientações do zelador.", category: "maintenance" },
];

/** CNPJ com dígitos verificadores válidos (fictício, para a demonstração). */
export function fakeCnpj(r: Rng) {
  const base = Array.from({ length: 8 }, () => r.int(0, 9)).concat([0, 0, 0, 1]);
  const dv = (nums: number[]) => {
    const w = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = nums.reduce((acc, n, i) => acc + n * w[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  const n = [...base, d1, d2].join("");
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

export const slugifyName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
