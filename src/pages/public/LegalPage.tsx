import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ShieldCheck, FileText } from 'lucide-react';

type LegalSection = {
  title: string;
  items: string[];
};

const updatedAt = '6 de junho de 2026';

const privacySections: LegalSection[] = [
  {
    title: '1. Quem somos',
    items: [
      'A Vimob fornece uma plataforma SaaS para gestao comercial, CRM, automacoes, atendimento, sites, funis, agenda, financeiro e recursos relacionados ao mercado imobiliario e a segmentos atendidos pela plataforma.',
      'Ao contratar ou usar a Vimob, a empresa cliente atua como controladora dos dados de seus usuarios, clientes, leads e contatos. A Vimob atua principalmente como operadora desses dados, tratando-os conforme as instrucoes da empresa cliente e conforme a legislacao aplicavel.',
    ],
  },
  {
    title: '2. Dados que podemos tratar',
    items: [
      'Dados cadastrais e de identificacao: nome, e-mail, telefone, CPF, CNPJ, CRECI, cargo, empresa, endereco e dados de faturamento.',
      'Dados de uso da plataforma: logs de acesso, permissoes, historico de atividades, interacoes, preferencias, configuracoes e eventos de seguranca.',
      'Dados comerciais inseridos pelo cliente: leads, contatos, mensagens, anotacoes, tarefas, imoveis, propostas, contratos, arquivos, midias e informacoes de funil.',
      'Dados tecnicos: IP, navegador, dispositivo, cookies essenciais, identificadores de sessao e informacoes necessarias para estabilidade e seguranca.',
    ],
  },
  {
    title: '3. Finalidades do tratamento',
    items: [
      'Criar e administrar contas, organizacoes, usuarios, permissoes, planos, trials e cobrancas.',
      'Operar funcionalidades da plataforma, incluindo CRM, atendimento, automacoes, integracoes, site publico, notificacoes, relatorios e suporte.',
      'Proteger a plataforma contra fraude, abuso, acessos indevidos e incidentes de seguranca.',
      'Cumprir obrigacoes legais, fiscais, contabeis, reguladoras e solicitações de autoridades competentes.',
      'Melhorar a experiencia, corrigir erros, medir desempenho e desenvolver recursos usando dados agregados ou anonimizados sempre que possivel.',
    ],
  },
  {
    title: '4. Bases legais',
    items: [
      'Execucao de contrato e procedimentos preliminares relacionados a contratacao da plataforma.',
      'Cumprimento de obrigacao legal ou regulatoria.',
      'Legitimo interesse para seguranca, prevencao a fraude, melhoria de produto, suporte e comunicacoes operacionais.',
      'Consentimento quando exigido, especialmente para comunicacoes promocionais, cookies nao essenciais ou usos opcionais.',
    ],
  },
  {
    title: '5. Compartilhamento de dados',
    items: [
      'Podemos compartilhar dados com provedores de infraestrutura, hospedagem, banco de dados, autenticacao, mensageria, pagamentos, analiticos, suporte e integracoes habilitadas pela empresa cliente.',
      'Tambem poderemos compartilhar informacoes quando necessario para cumprimento legal, defesa de direitos, auditorias, operacoes societarias ou requisicoes validas de autoridades.',
      'Nao vendemos dados pessoais. Integracoes externas seguem as configuracoes feitas pelo cliente e os termos dos respectivos fornecedores.',
    ],
  },
  {
    title: '6. Retencao, seguranca e direitos',
    items: [
      'Mantemos dados pelo tempo necessario para prestar o servico, cumprir obrigacoes legais, resolver disputas, prevenir fraudes e preservar registros comerciais.',
      'Adotamos medidas tecnicas e organizacionais razoaveis para proteger os dados, incluindo controle de acesso, segregacao por organizacao, logs, politicas de permissao e monitoramento.',
      'Titulares podem solicitar confirmacao de tratamento, acesso, correcao, portabilidade, anonimizacao, eliminacao, informacoes sobre compartilhamento e revisao de decisoes automatizadas, conforme a LGPD.',
      'Solicitacoes de privacidade devem ser enviadas para o canal oficial informado pela Vimob ou pela empresa cliente responsavel pelo atendimento ao titular.',
    ],
  },
];

const termsSections: LegalSection[] = [
  {
    title: '1. Aceite e escopo',
    items: [
      'Estes Termos regulam o acesso e uso da plataforma Vimob por empresas, profissionais, administradores e usuarios convidados.',
      'Ao criar conta, iniciar trial, contratar plano, acessar a plataforma ou aceitar estes Termos, voce declara que leu, compreendeu e concorda com as regras aplicaveis.',
    ],
  },
  {
    title: '2. Conta, organizacao e responsabilidades',
    items: [
      'O administrador da organizacao e responsavel pelas informacoes fornecidas, pelos usuarios convidados, permissoes concedidas, dados inseridos e integracoes ativadas.',
      'Credenciais de acesso sao pessoais e devem ser protegidas. Uso indevido, compartilhamento de senha ou acesso nao autorizado devem ser comunicados imediatamente.',
      'A Vimob pode suspender ou limitar acessos em caso de risco de seguranca, inadimplencia, violacao destes Termos, uso abusivo ou exigencia legal.',
    ],
  },
  {
    title: '3. Planos, trial e faturamento',
    items: [
      'Planos, precos, limites, modulos e condicoes comerciais sao apresentados no onboarding, checkout, proposta comercial ou area de faturamento.',
      'O plano Enterprise de R$197 pode incluir 7 dias de teste, quando informado no momento da contratacao. Apos o periodo de teste, a continuidade do acesso depende da regularizacao do pagamento.',
      'O plano Master de R$497 exige pagamento para liberacao completa, pois inclui recursos nao disponibilizados em teste gratuito.',
      'A plataforma pode enviar lembretes antes do fim do trial ou vencimento. A falta de pagamento pode gerar bloqueio, suspensao ou encerramento do acesso.',
    ],
  },
  {
    title: '4. Uso permitido',
    items: [
      'O cliente deve usar a plataforma de forma licita, respeitando direitos de terceiros, regras de privacidade, propriedade intelectual, politicas antispam e normas aplicaveis ao seu segmento.',
      'E proibido tentar acessar dados de outras organizacoes, burlar limites, explorar falhas, realizar engenharia reversa, sobrecarregar sistemas ou usar a plataforma para conteudo ilegal, abusivo ou fraudulento.',
    ],
  },
  {
    title: '5. Disponibilidade, suporte e integracoes',
    items: [
      'A Vimob busca manter a plataforma disponivel e segura, mas interrupcoes podem ocorrer por manutencao, atualizacoes, incidentes, terceiros, internet, provedores ou fatores fora do controle razoavel.',
      'Recursos conectados a WhatsApp, Meta, meios de pagamento, mapas, e-mail, telefonia, IA ou outros fornecedores dependem de disponibilidade, regras e credenciais desses terceiros.',
      'Suporte, prazos de atendimento e servicos adicionais podem variar conforme plano contratado ou acordo comercial.',
    ],
  },
  {
    title: '6. Propriedade intelectual, dados e encerramento',
    items: [
      'A plataforma, marca, codigo, layouts, fluxos, documentacao e recursos da Vimob permanecem de titularidade da Vimob ou de seus licenciantes.',
      'Os dados da organizacao e de seus clientes permanecem sob responsabilidade da empresa cliente, sem prejuizo dos tratamentos necessarios para operacao da plataforma.',
      'Em caso de cancelamento, inadimplencia prolongada ou encerramento, o acesso pode ser bloqueado e os dados podem ser retidos ou excluidos conforme politica de retencao, obrigacoes legais e contrato aplicavel.',
    ],
  },
];

export default function LegalPage() {
  const location = useLocation();
  const isTerms = location.pathname.includes('termos');
  const title = isTerms ? 'Termos de Uso' : 'Politica de Privacidade';
  const subtitle = isTerms
    ? 'Regras comerciais e operacionais para uso da plataforma Vimob.'
    : 'Como a Vimob trata dados pessoais em conformidade com a LGPD.';
  const sections = isTerms ? termsSections : privacySections;
  const Icon = isTerms ? FileText : ShieldCheck;

  return (
    <main className="dark min-h-screen bg-background text-foreground">
      <section className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10 md:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="text-sm font-semibold tracking-tight">
              Vimob
            </Link>
            <div className="flex gap-2">
              <Button variant={!isTerms ? 'secondary' : 'ghost'} size="sm" asChild>
                <Link to="/privacidade">Privacidade</Link>
              </Button>
              <Button variant={isTerms ? 'secondary' : 'ghost'} size="sm" asChild>
                <Link to="/termos">Termos</Link>
              </Button>
            </div>
          </div>
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Atualizado em {updatedAt}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{title}</h1>
              <p className="text-base leading-7 text-muted-foreground md:text-lg">{subtitle}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-8 md:grid-cols-[220px_1fr] md:px-8 md:py-12">
        <aside className="hidden md:block">
          <div className="sticky top-6 space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Documento</p>
            <p>Este texto deve ser revisado juridicamente antes de uso definitivo em producao.</p>
          </div>
        </aside>
        <Card className="border-border/70">
          <CardContent className="px-5 py-6 md:px-8 md:py-8">
            <div className="space-y-8">
              {sections.map((section, index) => (
                <section key={section.title} className="space-y-3">
                  {index > 0 && <Separator />}
                  <h2 className="pt-2 text-xl font-semibold tracking-tight">{section.title}</h2>
                  <div className="space-y-3 text-sm leading-7 text-muted-foreground md:text-base">
                    {section.items.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
