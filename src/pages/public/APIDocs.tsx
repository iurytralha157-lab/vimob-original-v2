import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Terminal, Globe, Lock, Code2, Shield, ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://iemalzlfnbouobyjwlwi.supabase.co';
const BASE_URL = `${SUPABASE_URL}/functions/v1/public-api`;

export default function APIDocs() {
  const [activeLang, setActiveLang] = useState('curl');

  useEffect(() => {
    document.title = 'Documentação da API | CRM Imobiliário';
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const endpoints = [
    {
      method: 'GET',
      path: '/properties',
      description: 'Lista os imóveis ativos da organização. Suporta filtros e paginação.',
      params: [
        { name: 'city', type: 'string', description: 'Filtrar por cidade (busca parcial)' },
        { name: 'neighborhood', type: 'string', description: 'Filtrar por bairro (busca parcial)' },
        { name: 'type', type: 'string', description: 'Tipo de imóvel (ex.: Apartamento, Casa)' },
        { name: 'purpose', type: 'string', description: 'Negócio: venda | locacao' },
        { name: 'min_price', type: 'number', description: 'Preço mínimo' },
        { name: 'max_price', type: 'number', description: 'Preço máximo' },
        { name: 'bedrooms', type: 'number', description: 'Quartos (mínimo)' },
        { name: 'page', type: 'number', description: 'Página (default 1)' },
        { name: 'per_page', type: 'number', description: 'Itens por página (default 50, máx 100)' },
      ],
    },
    {
      method: 'GET',
      path: '/properties/:id',
      description: 'Retorna os detalhes completos de um imóvel da organização.',
      params: [{ name: 'id', type: 'uuid', description: 'ID único do imóvel (UUID)' }],
    },
    {
      method: 'POST',
      path: '/leads',
      description: 'Cria um novo lead no CRM ou atualiza um existente (reentrada) via telefone.',
      params: [
        { name: 'name', type: 'string', description: 'Nome do lead (Obrigatório)', required: true },
        { name: 'phone', type: 'string', description: 'Telefone com DDD (Obrigatório)', required: true },
        { name: 'email', type: 'string', description: 'Email do lead' },
        { name: 'message', type: 'string', description: 'Mensagem de interesse' },
        { name: 'property_id', type: 'string', description: 'ID (UUID) ou Código do imóvel de interesse' },
        { name: 'source', type: 'string', description: 'Origem do lead (Padrão: API)' },
        { name: 'tags', type: 'string[]', description: 'Lista de IDs de tags para aplicar' },
      ],
    },
  ];

  const examplePropertyResponse = `{
  "data": [
    {
      "id": "8f3...e21",
      "code": "AP-1024",
      "title": "Apartamento 3 quartos no Centro",
      "type": "Apartamento",
      "purpose": "venda",
      "status": "ativo",
      "address": {
        "street": "Rua das Flores",
        "neighborhood": "Centro",
        "city": "Goiânia",
        "state": "GO",
        "zipcode": "74000-000"
      },
      "pricing": {
        "sale_price": 450000,
        "condominium_fee": 600,
        "iptu": 1200
      },
      "rooms": { "bedrooms": 3, "suites": 1, "bathrooms": 2, "parking": 2 },
      "area": { "useful": 85, "total": 95 },
      "main_image": "https://...",
      "images": ["https://...", "https://..."]
    }
  ],
  "pagination": { "page": 1, "per_page": 50, "total": 124, "total_pages": 3 }
}`;

  const exampleLeadRequest = `{
  "name": "João da Silva",
  "phone": "62999999999",
  "email": "joao@exemplo.com",
  "message": "Tenho interesse no imóvel AP-1024",
  "property_id": "AP-1024",
  "source": "Site Externo"
}`;

  const exampleLeadResponse = `{
  "success": true,
  "lead_id": "8f3...e21",
  "message": "Lead criado com sucesso",
  "reentry": false
}`;

  const errorTable = [
    { code: 401, msg: 'unauthorized / invalid_api_key / revoked', desc: 'Chave ausente, inválida ou revogada' },
    { code: 403, msg: 'module_disabled', desc: 'O módulo de API não está habilitado para esta organização' },
    { code: 404, msg: 'not_found', desc: 'Endpoint inexistente ou imóvel não encontrado' },
    { code: 500, msg: 'internal_error', desc: 'Erro interno' },
  ];

  const codeExamples = {
    curl: {
      get: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${BASE_URL}/properties?city=Goiania&purpose=venda&page=1&per_page=20"`,
      post: `curl -X POST -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '${exampleLeadRequest}' \\
  "${BASE_URL}/leads"`
    },
    javascript: {
      get: `const res = await fetch(
  "${BASE_URL}/properties?purpose=venda",
  { 
    headers: { 
      "Authorization": "Bearer " + process.env.API_KEY 
    } 
  }
);
const { data, pagination } = await res.json();`,
      post: `const res = await fetch(
  "${BASE_URL}/leads",
  { 
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.API_KEY 
    },
    body: JSON.stringify({
      name: "João da Silva",
      phone: "62999999999",
      email: "joao@exemplo.com",
      property_id: "AP-1024"
    })
  }
);
const result = await res.json();`
    },
    php: {
      get: `<?php
$ch = curl_init("${BASE_URL}/properties?purpose=venda");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer " . $api_key
]);
$response = curl_exec($ch);
$data = json_decode($response, true);
curl_close($ch);
?>`,
      post: `<?php
$data = [
    "name" => "João da Silva",
    "phone" => "62999999999",
    "email" => "joao@exemplo.com",
    "property_id" => "AP-1024"
];

$ch = curl_init("${BASE_URL}/leads");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "Authorization: Bearer " . $api_key
]);

$response = curl_exec($ch);
$result = json_decode($response, true);
curl_close($ch);
?>`
    },
    node: {
      get: `import axios from 'axios';

const { data } = await axios.get(
  "${BASE_URL}/properties",
  { 
    headers: { 
      Authorization: \`Bearer \${process.env.API_KEY}\` 
    } 
  }
);`,
      post: `import axios from 'axios';

const { data } = await axios.post(
  "${BASE_URL}/leads",
  {
    name: "João da Silva",
    phone: "62999999999",
    email: "joao@exemplo.com",
    property_id: "AP-1024"
  },
  { 
    headers: { 
      Authorization: \`Bearer \${process.env.API_KEY}\` 
    } 
  }
);`
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8 transition-colors">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="space-y-6 text-center sm:text-left">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-4 group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Voltar ao Início
          </Link>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="p-4 bg-primary rounded-3xl shadow-xl shadow-primary/20 animate-in fade-in zoom-in duration-500 shrink-0">
              <Code2 className="h-10 w-10 text-primary-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-extrabold tracking-tight">
                Documentação da <span className="text-primary">API Pública</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Integre os dados do seu CRM Imobiliário em qualquer plataforma de forma simples e segura.
              </p>
            </div>
          </div>
        </header>

        {/* Base URL */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-primary" /> URL Base
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-xl p-4 font-mono text-sm flex items-center justify-between gap-4 border">
              <code className="break-all">{BASE_URL}</code>
              <button
                onClick={() => copy(BASE_URL)}
                className="p-2 hover:bg-background rounded-lg transition-colors border shadow-sm"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Auth */}
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Lock className="h-5 w-5 text-primary" /> Autenticação
            </CardTitle>
            <CardDescription className="text-base">
              Toda requisição precisa do header <code className="bg-muted px-2 py-0.5 rounded text-primary font-mono text-sm border">Authorization</code> com sua chave de API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted rounded-2xl p-6 font-mono text-sm border shadow-inner">
              <span className="text-muted-foreground opacity-60"># Header de autorização</span><br />
              <code className="text-foreground">Authorization: Bearer <span className="text-amber-600 dark:text-amber-400">sk_live_...</span></code>
            </div>
            <div className="flex items-start gap-4 text-sm bg-amber-500/10 border border-amber-500/20 p-5 rounded-2xl">
              <Shield className="h-6 w-6 mt-0.5 text-amber-500 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-bold text-amber-700 dark:text-amber-400">Segurança em primeiro lugar</p>
                <p className="text-amber-800 dark:text-amber-200/80 leading-relaxed">
                  <strong>Nunca</strong> exponha sua chave no frontend (HTML, JavaScript cliente). 
                  Faça as requisições a partir do seu servidor e utilize variáveis de ambiente.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Gere sua chave em <strong className="text-foreground">Configurações → API Pública</strong> dentro do CRM. 
            </p>
          </CardContent>
        </Card>

        {/* Endpoints */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 px-2">
            <Terminal className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">Endpoints</h2>
          </div>
          
          <div className="space-y-8">
            {endpoints.map((ep, i) => (
              <Card key={i} className="overflow-hidden border-border/50">
                <CardHeader className="bg-muted/30 pb-4 border-b">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <Badge className={`${ep.method === 'GET' ? 'bg-blue-500' : 'bg-emerald-500'} hover:bg-opacity-90 text-white font-mono px-3 py-1`}>
                        {ep.method}
                      </Badge>
                      <code className="text-lg font-bold font-mono tracking-tight">{ep.path}</code>
                    </div>
                  </div>
                  <CardDescription className="text-base mt-2">
                    {ep.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
                      Parâmetros
                    </p>
                    <div className="border rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                          <tr>
                            <th className="text-left p-3 font-semibold">Nome</th>
                            <th className="text-left p-3 font-semibold">Tipo</th>
                            <th className="text-left p-3 font-semibold">Descrição</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {ep.params.map((p, j) => (
                            <tr key={j} className="hover:bg-muted/20 transition-colors">
                              <td className="p-3 font-mono text-primary font-medium">
                                {p.name}
                                {p.required && <span className="text-destructive ml-1">*</span>}
                              </td>
                              <td className="p-3 text-muted-foreground">{p.type}</td>
                              <td className="p-3">{p.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
                      Exemplo de URL
                    </p>
                    <div className="bg-muted rounded-xl p-4 font-mono text-xs border flex items-center justify-between gap-4 group">
                      <code className="break-all opacity-80">{BASE_URL}{ep.path}</code>
                      <button onClick={() => copy(`${BASE_URL}${ep.path}`)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-background rounded-lg border transition-all">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Code Examples */}
        <Card className="border-border shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Exemplos de Implementação</CardTitle>
              <div className="flex bg-muted p-1 rounded-xl gap-1">
                {Object.keys(codeExamples).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setActiveLang(lang)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      activeLang === lang 
                        ? 'bg-background text-foreground shadow-sm' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="get" className="space-y-6">
              <TabsList className="bg-muted p-1 rounded-xl w-full grid grid-cols-2">
                <TabsTrigger value="get" className="rounded-lg data-[state=active]:shadow-sm">Consumir Imóveis (GET)</TabsTrigger>
                <TabsTrigger value="post" className="rounded-lg data-[state=active]:shadow-sm">Enviar Leads (POST)</TabsTrigger>
              </TabsList>
              
              <TabsContent value="get" className="space-y-4 mt-4">
                <div className="relative group">
                  <pre className="bg-zinc-950 text-zinc-100 rounded-2xl p-6 font-mono text-xs overflow-x-auto border border-white/10 shadow-xl leading-relaxed">
                    {codeExamples[activeLang as keyof typeof codeExamples].get}
                  </pre>
                  <button 
                    onClick={() => copy(codeExamples[activeLang as keyof typeof codeExamples].get)}
                    className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" /> Resposta Esperada
                  </p>
                  <pre className="bg-zinc-950 text-zinc-100 rounded-2xl p-6 font-mono text-xs overflow-x-auto border border-white/10 shadow-xl leading-relaxed">
                    {examplePropertyResponse}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="post" className="space-y-4 mt-4">
                <div className="relative group">
                  <pre className="bg-zinc-950 text-zinc-100 rounded-2xl p-6 font-mono text-xs overflow-x-auto border border-white/10 shadow-xl leading-relaxed">
                    {codeExamples[activeLang as keyof typeof codeExamples].post}
                  </pre>
                  <button 
                    onClick={() => copy(codeExamples[activeLang as keyof typeof codeExamples].post)}
                    className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" /> Resposta Esperada
                  </p>
                  <pre className="bg-zinc-950 text-zinc-100 rounded-2xl p-6 font-mono text-xs overflow-x-auto border border-white/10 shadow-xl leading-relaxed">
                    {exampleLeadResponse}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Erros */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Códigos de Erro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold">HTTP</th>
                    <th className="text-left p-3 font-semibold">Código</th>
                    <th className="text-left p-3 font-semibold">Descrição</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {errorTable.map((e) => (
                    <tr key={e.code} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono font-bold text-muted-foreground">{e.code}</td>
                      <td className="p-3 font-mono text-primary">{e.msg}</td>
                      <td className="p-3">{e.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Privacidade */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Privacidade e Segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            <p>
              Por padrão, a API <strong>não</strong> retorna o número exato do logradouro
              nem dados do proprietário (nome, e-mail, telefones, comentários internos) para proteger a privacidade.
            </p>
            <p>
              Apenas imóveis com status <code>ativo</code> são listados. O lead enviado via POST é processado seguindo as mesmas regras de privacidade e segurança dos formulários internos do CRM.
            </p>
          </CardContent>
        </Card>

        <footer className="text-center text-sm text-muted-foreground pt-12 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} CRM Imobiliário — Todos os direitos reservados.</p>
          <div className="flex items-center gap-6">
            <Link to="/help" className="hover:text-primary transition-colors">Suporte</Link>
            <Link to="/settings" className="hover:text-primary transition-colors">Configurações</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
