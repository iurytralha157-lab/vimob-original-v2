import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IMOVIEW_BASE = "https://api.imoview.com.br";

function extractPhotos(obj: any): string[] {
  if (!obj || typeof obj !== "object") return [];
  const photos: string[] = [];
  const seen = new Set<string>();

  const photoFields = [
    "fotos", "Fotos", "imagens", "Imagens", "urlFotos", "UrlFotos",
    "galeria", "Galeria", "galerias", "Galerias", "photos", "Photos",
    "images", "Images", "midia", "Midia", "midias", "Midias",
    "FotoImovel", "fotoImovel", "fotosImovel", "FotosImovel",
    "listaFotos", "ListaFotos", "arquivos", "Arquivos",
  ];

  function addUrl(url: string) {
    if (url && typeof url === "string" && url.startsWith("http") && !seen.has(url)) {
      seen.add(url);
      photos.push(url);
    }
  }

  function extractFromItem(item: any) {
    if (typeof item === "string") {
      addUrl(item);
    } else if (item && typeof item === "object") {
      const urlFields = [
        "url", "Url", "URL", "urlFoto", "UrlFoto", "foto", "Foto",
        "src", "Src", "link", "Link", "original", "Original",
        "grande", "Grande", "media", "Media", "urlArquivo", "UrlArquivo",
        "caminho", "Caminho", "urlImagem", "UrlImagem",
      ];
      for (const f of urlFields) {
        if (item[f]) { addUrl(String(item[f])); break; }
      }
    }
  }

  // Search known fields
  for (const field of photoFields) {
    const val = obj[field];
    if (Array.isArray(val)) {
      for (const item of val) extractFromItem(item);
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      // Could be a nested object with photo arrays
      for (const key of Object.keys(val)) {
        const inner = val[key];
        if (Array.isArray(inner)) {
          for (const item of inner) extractFromItem(item);
        }
      }
    }
  }

  // Deep scan: look for any array property containing objects with url-like fields
  if (photos.length === 0) {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (Array.isArray(val) && val.length > 0 && val[0] && typeof val[0] === "object") {
        const first = val[0];
        const hasUrlField = Object.keys(first).some(k =>
          /url|foto|imagem|image|src|link|caminho|arquivo/i.test(k)
        );
        if (hasUrlField) {
          console.log(`[extractPhotos] Found photo-like array in field "${key}" with ${val.length} items`);
          for (const item of val) extractFromItem(item);
        }
      }
    }
  }

  return photos;
}

function extractMainImage(obj: any): string {
  if (!obj || typeof obj !== "object") return "";
  const fields = [
    "fotoPrincipal", "FotoPrincipal", "imagemPrincipal", "ImagemPrincipal",
    "foto_principal", "imagem_principal", "mainImage", "MainImage",
    "thumbnail", "Thumbnail", "capa", "Capa", "urlFotoPrincipal", "UrlFotoPrincipal",
  ];
  for (const f of fields) {
    if (obj[f] && typeof obj[f] === "string" && obj[f].startsWith("http")) return obj[f];
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
      .from("imoview_integrations")
      .select("*")
      .eq("organization_id", organization_id)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: "Integration not configured" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = integration.api_key;

    // ---- TEST MODE ----
    if (action === "test") {
      try {
        console.log("Testing Imoview connection with key:", apiKey.substring(0, 4) + "...");
        const res = await fetch(`${IMOVIEW_BASE}/Imovel/RetornarImoveisDisponiveis`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "chave": apiKey },
          body: JSON.stringify({ numeroPagina: 1, numeroRegistros: 1 }),
        });

        const text = await res.text();
        console.log("Imoview test response status:", res.status);
        console.log("Imoview test response body:", text.substring(0, 2000));

        if (!res.ok) {
          return new Response(
            JSON.stringify({ success: false, error: `API returned ${res.status}: ${text.substring(0, 500)}` }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return new Response(
          JSON.stringify({ success: true, message: "Conexão válida", sample: data }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        console.error("Imoview test error:", e);
        return new Response(
          JSON.stringify({ success: false, error: `Connection failed: ${e?.message}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ---- SYNC MODE ----
    if (action === "sync") {
      let page = 1;
      const perPage = 50;
      let totalSynced = 0;
      let totalSkipped = 0;
      let hasMore = true;
      const errors: string[] = [];

      while (hasMore) {
        let res: Response;
        try {
          res = await fetch(`${IMOVIEW_BASE}/Imovel/RetornarImoveisDisponiveis`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "chave": apiKey },
            body: JSON.stringify({ numeroPagina: page, numeroRegistros: perPage }),
          });
        } catch (e: any) {
          errors.push(`Fetch error page ${page}: ${e?.message}`);
          break;
        }

        if (!res.ok) {
          const errText = await res.text();
          console.error(`API error page ${page}: ${res.status} - ${errText.substring(0, 500)}`);
          errors.push(`API error page ${page}: ${res.status}`);
          break;
        }

        const rawText = await res.text();
        console.log(`Imoview sync page ${page} response (first 2000 chars):`, rawText.substring(0, 2000));

        let data;
        try { data = JSON.parse(rawText); } catch {
          errors.push(`Invalid JSON on page ${page}`);
          break;
        }

        let items: any[] = [];
        if (Array.isArray(data)) {
          items = data;
        } else if (data && typeof data === "object") {
          if (data.lista) items = data.lista;
          else if (data.imoveis) items = data.imoveis;
          else {
            items = Object.values(data).filter((v: any) => v && typeof v === "object" && (v.codigo || v.codigoImovel));
          }
        }

        console.log(`Page ${page}: found ${items.length} items`);

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of items) {
          try {
            const codigo = String(item.codigo || item.codigoImovel || item.referencia || "");
            if (!codigo) {
              totalSkipped++;
              continue;
            }

            // Extract photos from listing item first
            let fotos: string[] = extractPhotos(item);
            let imagemPrincipal = extractMainImage(item);

            // Always try detail endpoint for complete gallery
            try {
              const detailRes = await fetch(
                `${IMOVIEW_BASE}/Imovel/RetornarDetalhesImovelDisponivel?codigoImovel=${codigo}`,
                { method: "GET", headers: { "chave": apiKey } }
              );
              if (detailRes.ok) {
                const detailText = await detailRes.text();
                // Log first detail response for debugging
                if (totalSynced === 0 && fotos.length === 0) {
                  console.log(`[imoview-sync] Detail response for ${codigo} (first 3000 chars):`, detailText.substring(0, 3000));
                }
                try {
                  const detail = JSON.parse(detailText);
                  const detailPhotos = extractPhotos(detail);
                  if (detailPhotos.length > fotos.length) {
                    console.log(`[imoview-sync] ${codigo}: listing had ${fotos.length} photos, detail has ${detailPhotos.length}`);
                    fotos = detailPhotos;
                  }
                  if (!imagemPrincipal) {
                    imagemPrincipal = extractMainImage(detail);
                  }
                } catch { /* invalid json */ }
              }
              // Small delay to avoid rate limiting
              await new Promise(r => setTimeout(r, 150));
            } catch {
              // continue without detail photos
            }

            if (!imagemPrincipal && fotos.length > 0) {
              imagemPrincipal = fotos[0];
            }

            // Map finalidade
            let tipoNegocio = "Venda";
            const finalidade = String(item.finalidade || item.destinacao || "").toLowerCase();
            if (finalidade.includes("venda") && (finalidade.includes("locac") || finalidade.includes("alugu"))) {
              tipoNegocio = "Venda e Aluguel";
            } else if (finalidade.includes("locac") || finalidade.includes("alugu")) {
              tipoNegocio = "Aluguel";
            }

            let preco: number | null = null;
            if (tipoNegocio === "Aluguel") {
              preco = parseFloat(String(item.valorAluguel || item.valor_aluguel || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || null;
            }
            if (!preco) {
              preco = parseFloat(String(item.valorVenda || item.valor_venda || item.valor || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || null;
            }

            const propertyData = {
              organization_id,
              imoview_codigo: codigo,
              title: item.titulo || item.tituloSite || item.tipoImovel || `Imóvel ${codigo}`,
              tipo_de_imovel: item.tipoImovel || item.tipo || "Outro",
              tipo_de_negocio: tipoNegocio,
              status: "ativo",
              endereco: item.endereco || item.logradouro || null,
              numero: item.numero ? String(item.numero) : null,
              complemento: item.complemento || null,
              bairro: item.bairro || null,
              cidade: item.cidade || null,
              uf: item.uf || item.estado || null,
              cep: item.cep || null,
              quartos: parseInt(item.quartos || item.dormitorios || "0") || null,
              suites: parseInt(item.suites || "0") || null,
              banheiros: parseInt(item.banheiros || "0") || null,
              vagas: parseInt(item.vagas || item.garagem || "0") || null,
              area_util: parseFloat(String(item.areaUtil || item.area_util || "0")) || null,
              area_total: parseFloat(String(item.areaTotal || item.area_total || "0")) || null,
              preco,
              condominio: parseFloat(String(item.condominio || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || null,
              iptu: parseFloat(String(item.iptu || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || null,
              descricao: item.descricao || item.observacao || null,
              imagem_principal: imagemPrincipal || null,
              fotos,
              latitude: parseFloat(item.latitude) || null,
              longitude: parseFloat(item.longitude) || null,
              exclusividade: String(item.exclusividade || item.exclusivo || "").toLowerCase() === "sim" ? true : false,
            };

            const { error: upsertError } = await supabase
              .from("properties")
              .upsert(propertyData, {
                onConflict: "organization_id,imoview_codigo",
                ignoreDuplicates: false,
              });

            if (upsertError) {
              errors.push(`Upsert error for ${codigo}: ${upsertError.message}`);
            } else {
              totalSynced++;
            }
          } catch (e: any) {
            errors.push(`Process error: ${e?.message}`);
          }
        }

        if (items.length < perPage) {
          hasMore = false;
        } else {
          page++;
        }
      }

      await supabase
        .from("imoview_integrations")
        .update({
          last_sync_at: new Date().toISOString(),
          total_synced: totalSynced,
          sync_log: { last_run: new Date().toISOString(), synced: totalSynced, skipped: totalSkipped, errors: errors.slice(0, 20) },
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
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
