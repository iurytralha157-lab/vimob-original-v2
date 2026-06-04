import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getCategoryPrefix(categoria: string): string {
  const cat = (categoria || "").toLowerCase();
  if (cat.includes("casa") || cat.includes("sobrado")) return "CA";
  if (cat.includes("cobertura")) return "CB";
  if (cat.includes("comercial") || cat.includes("sala") || cat.includes("loja") || cat.includes("galpao") || cat.includes("galpão")) return "CO";
  if (cat.includes("terreno") || cat.includes("lote")) return "TE";
  return "AP";
}

async function generateCode(supabase: any, organizationId: string, prefix: string): Promise<string> {
  const { data: seq } = await supabase
    .from("property_sequences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("prefix", prefix)
    .single();

  let nextNumber = 1;
  if (seq) {
    nextNumber = (seq.last_number || 0) + 1;
    await supabase
      .from("property_sequences")
      .update({ last_number: nextNumber })
      .eq("id", seq.id);
  } else {
    await supabase
      .from("property_sequences")
      .insert({ organization_id: organizationId, prefix, last_number: 1 });
  }
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

async function testConnection(apiUrl: string, apiKey: string) {
  const pesquisa = {
    fields: ["Codigo"],
    paginacao: { pagina: 1, quantidade: 1 },
  };
  const searchParams = new URLSearchParams();
  searchParams.append("key", apiKey);
  searchParams.append("pesquisa", JSON.stringify(pesquisa));

  const res = await fetch(`${apiUrl}/imoveis/listar?${searchParams.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `API returned ${res.status}: ${text}` };
  }
  const data = await res.json();
  return { success: true, message: "Conexão válida", sample: data };
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").split("?")[0];
}

function parseMobilia(value: unknown): string | null {
  if (!value) return null;
  const v = String(value).toLowerCase().trim();
  if (v === "sim" || v === "mobiliado" || v === "completo") return "Mobiliado";
  if (v.includes("semi") || v === "parcial" || v === "parcialmente") return "Semi-mobiliado";
  if (v === "nao" || v === "não" || v === "nenhum" || v === "sem") return "Sem mobília";
  return null;
}

function extractPhotosFromPayload(payload: any): string[] {
  const seen = new Set<string>();
  const photos: string[] = [];

  const pushPhoto = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed.startsWith("http")) return;
    const key = normalizeUrl(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    photos.push(trimmed);
  };

  pushPhoto(payload?.FotoDestaque);
  pushPhoto(payload?.FotoDestaquePequena);

  const fotosData = payload?.Foto ?? payload?.fotos ?? payload?.Fotos;
  const entries = Array.isArray(fotosData)
    ? fotosData
    : fotosData && typeof fotosData === "object"
      ? Object.values(fotosData)
      : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    pushPhoto((entry as any).Foto);
    if (!(entry as any).Foto) {
      pushPhoto((entry as any).FotoPequena);
    }
  }
  return photos;
}

async function fetchPropertyPhotos(apiUrl: string, apiKey: string, codigo: string, fallbackMainImage?: string | null): Promise<string[]> {
  const fallbackPhotos = typeof fallbackMainImage === "string" && fallbackMainImage.startsWith("http")
    ? [fallbackMainImage]
    : [];

  try {
    const pesquisa = {
      fields: [
        "Codigo", "FotoDestaque",
        { Foto: ["Foto", "FotoPequena", "Destaque", "Tipo", "Descricao"] },
      ],
    };
    const searchParams = new URLSearchParams();
    searchParams.append("key", apiKey);
    searchParams.append("pesquisa", JSON.stringify(pesquisa));
    searchParams.append("imovel", codigo);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${apiUrl}/imoveis/detalhes?${searchParams.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      await res.text();
      return fallbackPhotos;
    }

    const data = await res.json();
    const payload = Array.isArray(data) ? data[0] : data;
    const photos = extractPhotosFromPayload(payload);
    return photos.length > 0 ? photos : fallbackPhotos;
  } catch (_e) {
    return fallbackPhotos;
  }
}

// Parallel execution with concurrency limit
async function parallelMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function syncProperties(supabase: any, apiUrl: string, apiKey: string, organizationId: string, importInactive: boolean) {
  const fields = [
    "Codigo", "Categoria", "Status", "Finalidade",
    "ValorVenda", "ValorLocacao", "Dormitorios", "Suites",
    "BanheiroSocialQtd", "Vagas", "AreaPrivativa", "AreaTotal",
    "Endereco", "Numero", "Complemento", "Bairro", "Cidade", "UF", "CEP",
    "DescricaoWeb", "FotoDestaque",
    "Latitude", "Longitude",
    "ValorCondominio", "ValorIptu", "AnoConstrucao", "TituloSite",
    "Mobiliado", "AceitaPermuta",
  ];

  let page = 1;
  const perPage = 50;
  let totalSynced = 0;
  let totalSkipped = 0;
  let hasMore = true;
  const errors: string[] = [];
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 140_000; // 140s safety margin (Supabase Pro = 150s)

  while (hasMore) {
    // Time guard - stop before timeout
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log(`Time limit reached at page ${page}. Synced ${totalSynced} so far.`);
      errors.push(`Timeout: processou até página ${page - 1}. Sincronize novamente para continuar.`);
      break;
    }

    const pesquisa = {
      fields,
      paginacao: { pagina: page, quantidade: perPage },
    };

    const searchParams = new URLSearchParams();
    searchParams.append("key", apiKey);
    searchParams.append("pesquisa", JSON.stringify(pesquisa));
    searchParams.append("showtotal", "1");
    if (importInactive) {
      searchParams.append("showSuspended", "1");
    }

    let res: Response;
    try {
      res = await fetch(`${apiUrl}/imoveis/listar?${searchParams.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    } catch (e) {
      errors.push(`Fetch error page ${page}: ${(e as Error).message}`);
      break;
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Vista API error page ${page}: ${res.status} - ${errText}`);
      errors.push(`API error page ${page}: ${res.status}`);
      break;
    }

    const data = await res.json();
    const items = Object.values(data).filter(
      (v: any) => v && typeof v === "object" && v.Codigo
    ) as any[];

    console.log(`Page ${page}: ${items.length} items found`);

    if (items.length === 0) {
      hasMore = false;
      break;
    }

    // Filter out inactive first
    const activeItems = items.filter((item) => {
      const itemStatus = String(item.Status || "").toLowerCase();
      if (!importInactive && (itemStatus.includes("inativ") || itemStatus.includes("suspend"))) {
        totalSkipped++;
        return false;
      }
      return true;
    });

    // Check existing properties in batch
    const codigos = activeItems.map((item) => String(item.Codigo));
    const { data: existingProps } = await supabase
      .from("properties")
      .select("id, vista_codigo")
      .eq("organization_id", organizationId)
      .in("vista_codigo", codigos);

    const existingMap = new Map<string, string>();
    if (existingProps) {
      for (const p of existingProps) {
        existingMap.set(p.vista_codigo, p.id);
      }
    }

    // Fetch photos in parallel (10 concurrent requests)
    const photosResults = await parallelMap(
      activeItems,
      (item) => fetchPropertyPhotos(apiUrl, apiKey, String(item.Codigo), item.FotoDestaque),
      10
    );

    // Process items
    for (let i = 0; i < activeItems.length; i++) {
      const item = activeItems[i];
      try {
        const codigo = String(item.Codigo);
        const allPhotos = photosResults[i];
        const imagemPrincipal = allPhotos[0] || "";

        const valorVenda = parseFloat(String(item.ValorVenda || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || null;
        const valorLocacao = parseFloat(String(item.ValorLocacao || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || null;

        let tipoNegocio = "Venda";
        const finalidade = String(item.Finalidade || "").toLowerCase();
        const hasVenda = finalidade.includes("venda") || !!valorVenda;
        const hasLocacao = finalidade.includes("locac") || finalidade.includes("alugu") || !!valorLocacao;

        if (hasVenda && hasLocacao) {
          tipoNegocio = "Venda e Aluguel";
        } else if (hasLocacao) {
          tipoNegocio = "Aluguel";
        }

        const preco = valorVenda || valorLocacao;
        const itemStatus = String(item.Status || "").toLowerCase();
        let status = "ativo";
        if (itemStatus.includes("inativ") || itemStatus.includes("suspend")) {
          status = "inativo";
        } else if (itemStatus.includes("vendid") || itemStatus.includes("locad")) {
          status = "vendido";
        }

        const categoria = item.Categoria || "Apartamento";
        const existingId = existingMap.get(codigo);

        const propertyData: Record<string, any> = {
          organization_id: organizationId,
          vista_codigo: codigo,
          title: item.TituloSite || item.Categoria || `Imóvel ${codigo}`,
          tipo_de_imovel: categoria,
          tipo_de_negocio: tipoNegocio,
          status,
          endereco: item.Endereco || null,
          numero: item.Numero || null,
          complemento: item.Complemento || null,
          bairro: item.Bairro || null,
          cidade: item.Cidade || null,
          uf: item.UF || null,
          cep: item.CEP || null,
          quartos: parseInt(item.Dormitorios) || null,
          suites: parseInt(item.Suites) || null,
          banheiros: parseInt(item.BanheiroSocialQtd) || null,
          vagas: parseInt(item.Vagas) || null,
          area_util: parseFloat(item.AreaPrivativa) || null,
          area_total: parseFloat(item.AreaTotal) || null,
          preco,
          valor_locacao: valorLocacao,
          condominio: parseFloat(String(item.ValorCondominio || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || null,
          iptu: parseFloat(String(item.ValorIptu || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || null,
          ano_construcao: parseInt(item.AnoConstrucao) || null,
          descricao: item.DescricaoWeb || null,
          imagem_principal: imagemPrincipal || null,
          fotos: allPhotos,
          latitude: parseFloat(item.Latitude) || null,
          longitude: parseFloat(item.Longitude) || null,
          mobilia: parseMobilia(item.Mobiliado),
          seguro_incendio: null,
          exclusividade: String(item.Exclusividade || item.ExclusividadeVenda || "").toLowerCase() === "sim" ? true : false,
        };

        let upsertError;
        if (existingId) {
          const { error } = await supabase.from("properties").update(propertyData).eq("id", existingId);
          upsertError = error;
        } else {
          const prefix = getCategoryPrefix(categoria);
          const code = await generateCode(supabase, organizationId, prefix);
          propertyData.code = code;
          const { error } = await supabase.from("properties").insert([propertyData]);
          upsertError = error;
        }

        if (upsertError) {
          errors.push(`DB error ${codigo}: ${upsertError.message}`);
        } else {
          totalSynced++;
        }
      } catch (e) {
        errors.push(`Process error: ${(e as Error).message}`);
      }
    }

    if (items.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return { totalSynced, totalSkipped, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, organization_id } = await req.json();

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integration, error: intError } = await supabase
      .from("vista_integrations")
      .select("*")
      .eq("organization_id", organization_id)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: "Integration not configured" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let apiUrl = integration.api_url.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(apiUrl)) {
      apiUrl = `https://${apiUrl}`;
    }
    const apiKey = integration.api_key;

    if (action === "test") {
      try {
        const result = await testConnection(apiUrl, apiKey);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: `Connection failed: ${(e as Error).message}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "sync") {
      const { totalSynced, totalSkipped, errors } = await syncProperties(
        supabase, apiUrl, apiKey, organization_id, !!integration.import_inactive
      );

      await supabase
        .from("vista_integrations")
        .update({
          last_sync_at: new Date().toISOString(),
          total_synced: totalSynced,
          sync_log: {
            last_run: new Date().toISOString(),
            synced: totalSynced,
            skipped: totalSkipped,
            errors: errors.slice(0, 20),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organization_id);

      return new Response(
        JSON.stringify({
          success: true,
          synced: totalSynced,
          skipped: totalSkipped,
          errors: errors.slice(0, 10),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Vista sync fatal error:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
