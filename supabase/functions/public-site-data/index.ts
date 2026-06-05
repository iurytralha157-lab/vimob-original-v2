import { createClient } from 'npm:@supabase/supabase-js@2';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BILLING_BLOCKED_STATUSES = new Set(['suspended', 'pending_payment', 'overdue', 'past_due', 'blocked', 'cancelled']);

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organization_id');
    const endpoint = url.searchParams.get('endpoint') || 'properties';
    const propertyCode = url.searchParams.get('property_code');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '12');
    
    // Search & Filters
    const search = url.searchParams.get('search') || '';
    const tipo = url.searchParams.get('tipo') || '';
    const finalidade = url.searchParams.get('finalidade') || '';
    const minPrice = url.searchParams.get('min_price');
    const maxPrice = url.searchParams.get('max_price');
    const quartos = url.searchParams.get('quartos');
    const suites = url.searchParams.get('suites');
    const banheiros = url.searchParams.get('banheiros');
    const vagas = url.searchParams.get('vagas');
    const cidade = url.searchParams.get('cidade');
    const bairro = url.searchParams.get('bairro');
    const minArea = url.searchParams.get('min_area');
    const maxArea = url.searchParams.get('max_area');
    const mobilia = url.searchParams.get('mobilia');
    const pet = url.searchParams.get('pet');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rateLimit = await enforceRateLimit(
      supabase,
      req,
      `public-site-data:${organizationId || 'missing-org'}`,
      [
        { name: 'burst', limit: 180, windowSeconds: 60 },
        { name: 'hourly', limit: 3000, windowSeconds: 3600 },
      ],
      corsHeaders,
    );

    if (rateLimit.response) return rateLimit.response;

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'organization_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Public site data request: ${endpoint} for org: ${organizationId}`);

    const { data: organizationAccess, error: organizationAccessError } = await supabase
      .from('organizations')
      .select('is_active, subscription_status')
      .eq('id', organizationId)
      .maybeSingle();

    if (organizationAccessError || !organizationAccess) {
      return new Response(
        JSON.stringify({ error: 'organization_not_found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (
      organizationAccess.is_active === false ||
      BILLING_BLOCKED_STATUSES.has(String(organizationAccess.subscription_status || '').toLowerCase())
    ) {
      return new Response(
        JSON.stringify({
          error: 'site_blocked',
          message: 'Acesso bloqueado, entre em contato com o administrador.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let response;

    switch (endpoint) {
      case 'properties': {
        // Optimized: only list-relevant fields + estimated count for speed
        const LIST_FIELDS = 'id, code, title, bairro, cidade, uf, endereco, quartos, suites, banheiros, vagas, area_util, preco, valor_locacao, tipo_de_negocio, imagem_principal';
        let query = supabase
          .from('properties')
          .select(LIST_FIELDS, { count: 'estimated' })
          .eq('organization_id', organizationId)
          .eq('status', 'ativo')
          .order('created_at', { ascending: false });

        // Search filter - busca em todos os campos relevantes
        if (search) {
          query = query.or(`title.ilike.%${search}%,descricao.ilike.%${search}%,bairro.ilike.%${search}%,cidade.ilike.%${search}%,code.ilike.%${search}%,vista_codigo.ilike.%${search}%,imoview_codigo.ilike.%${search}%,endereco.ilike.%${search}%,uf.ilike.%${search}%,tipo_de_imovel.ilike.%${search}%,tipo_de_negocio.ilike.%${search}%`);
        }
        
        // Type filter (Apartamento, Casa, etc)
        if (tipo) {
          query = query.eq('tipo_de_imovel', tipo);
        }
        
        // Finalidade filter (Venda, Aluguel)
        if (finalidade) {
          query = query.ilike('tipo_de_negocio', `%${finalidade}%`);
        }
        
        // Price filters
        if (minPrice) {
          query = query.gte('preco', parseFloat(minPrice));
        }
        if (maxPrice) {
          query = query.lte('preco', parseFloat(maxPrice));
        }
        
        // Rooms/features filters
        if (quartos) {
          query = query.gte('quartos', parseInt(quartos));
        }
        if (suites) {
          query = query.gte('suites', parseInt(suites));
        }
        if (banheiros) {
          query = query.gte('banheiros', parseInt(banheiros));
        }
        if (vagas) {
          query = query.gte('vagas', parseInt(vagas));
        }
        
        // Location filters
        if (cidade) {
          query = query.ilike('cidade', `%${cidade}%`);
        }
        if (bairro) {
          query = query.ilike('bairro', `%${bairro}%`);
        }
        
        // Area filters
        if (minArea) {
          query = query.gte('area_util', parseFloat(minArea));
        }
        if (maxArea) {
          query = query.lte('area_util', parseFloat(maxArea));
        }
        
        // Furniture filter - map simplified values to DB patterns
        if (mobilia) {
          if (mobilia === 'mobiliado') {
            // Match "Mobiliado" but NOT "Semi-mobiliado"
            query = query.eq('mobilia', 'Mobiliado');
          } else if (mobilia === 'semi') {
            query = query.ilike('mobilia', '%semi%');
          } else if (mobilia === 'sem') {
            query = query.ilike('mobilia', '%sem%');
          } else {
            query = query.ilike('mobilia', `%${mobilia}%`);
          }
        }
        if (pet === 'true') {
          query = query.eq('aceita_pet', true);
        }

        // Pagination
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) {
          console.error('Error fetching properties:', error);
          throw error;
        }

        response = {
          properties: data || [],
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        };
        break;
      }

      case 'property': {
        if (!propertyCode) {
          return new Response(
            JSON.stringify({ error: 'property_code is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('code', propertyCode)
          .eq('status', 'ativo')
          .maybeSingle();

        if (error || !data) {
          return new Response(
            JSON.stringify({ error: 'Property not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        response = { property: data };
        break;
      }

      case 'featured': {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('status', 'ativo')
          .eq('destaque', true)
          .order('created_at', { ascending: false })
          .limit(6);

        if (error) {
          console.error('Error fetching featured properties:', error);
          throw error;
        }

        response = { properties: data || [] };
        break;
      }

      case 'exclusive': {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('status', 'ativo')
          .eq('exclusividade', true)
          .order('created_at', { ascending: false })
          .limit(6);

        if (error) {
          console.error('Error fetching exclusive properties:', error);
          throw error;
        }

        response = { properties: data || [] };
        break;
      }

      case 'property-types': {
        const { data, error } = await supabase
          .from('properties')
          .select('tipo_de_imovel')
          .eq('organization_id', organizationId)
          .eq('status', 'ativo')
          .not('tipo_de_imovel', 'is', null);

        if (error) {
          console.error('Error fetching property types:', error);
          throw error;
        }

        const types = [...new Set(data?.map(p => p.tipo_de_imovel).filter(Boolean))];
        response = { types };
        break;
      }

      case 'cities': {
        const { data, error } = await supabase
          .from('properties')
          .select('cidade')
          .eq('organization_id', organizationId)
          .eq('status', 'ativo')
          .not('cidade', 'is', null);

        if (error) {
          console.error('Error fetching cities:', error);
          throw error;
        }

        const cities = [...new Set(data?.map(p => p.cidade).filter(Boolean))];
        response = { cities };
        break;
      }

      case 'neighborhoods': {
        let neighborhoodQuery = supabase
          .from('properties')
          .select('bairro')
          .eq('organization_id', organizationId)
          .eq('status', 'ativo')
          .not('bairro', 'is', null);

        // Filter by city if provided
        if (cidade) {
          neighborhoodQuery = neighborhoodQuery.ilike('cidade', `%${cidade}%`);
        }

        const { data, error } = await neighborhoodQuery;

        if (error) {
          console.error('Error fetching neighborhoods:', error);
          throw error;
        }

        const neighborhoods = [...new Set(data?.map(p => p.bairro).filter(Boolean))];
        response = { neighborhoods };
        break;
      }

      case 'related': {
        if (!propertyCode) {
          return new Response(
            JSON.stringify({ error: 'property_code is required for related endpoint' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // First, get the current property to know its type and location
        const { data: currentProperty } = await supabase
          .from('properties')
          .select('tipo_de_imovel, cidade, bairro')
          .eq('organization_id', organizationId)
          .eq('code', propertyCode)
          .single();

        // Build query for related properties
        let relatedQuery = supabase
          .from('properties')
          .select('id, code, title, preco, valor_locacao, tipo_de_negocio, tipo_de_imovel, quartos, suites, banheiros, vagas, area_util, bairro, cidade, imagem_principal')
          .eq('organization_id', organizationId)
          .eq('status', 'ativo')
          .neq('code', propertyCode) // Exclude current property
          .limit(parseInt(url.searchParams.get('limit') || '4'));

        // Filter by same type if available
        if (currentProperty?.tipo_de_imovel) {
          relatedQuery = relatedQuery.eq('tipo_de_imovel', currentProperty.tipo_de_imovel);
        }

        // Optionally filter by city
        if (currentProperty?.cidade) {
          relatedQuery = relatedQuery.eq('cidade', currentProperty.cidade);
        }

        const { data: relatedData, error: relatedError } = await relatedQuery;

        if (relatedError) {
          console.error('Error fetching related properties:', relatedError);
          throw relatedError;
        }

        response = { properties: relatedData || [] };
        break;
      }

      case 'map-properties': {
        // Return only properties with valid coordinates
        const { data, error } = await supabase
          .from('properties')
          .select('id, code, title, preco, valor_locacao, tipo_de_negocio, tipo_de_imovel, quartos, banheiros, vagas, area_util, imagem_principal, latitude, longitude, bairro, cidade')
          .eq('organization_id', organizationId)
          .eq('status', 'ativo')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);

        if (error) {
          console.error('Error fetching map properties:', error);
          throw error;
        }

        response = { properties: data || [] };
        break;
      }

      case 'favorites': {
        const ids = url.searchParams.get('ids');
        if (!ids) {
          response = { properties: [] };
          break;
        }
        const idList = ids.split(',').filter(Boolean);
        if (idList.length === 0) {
          response = { properties: [] };
          break;
        }

        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .eq('organization_id', organizationId)
          .in('id', idList);

        if (error) {
          console.error('Error fetching favorite properties:', error);
          throw error;
        }

        response = { properties: data || [] };
        break;
      }

      case 'home': {
        // Fetch everything for home page in parallel
        const [
          { data: featured },
          { data: exclusive },
          { data: latest },
          { data: typesData },
          { data: citiesData }
        ] = await Promise.all([
          supabase.from('properties').select('id, code, title, bairro, cidade, uf, quartos, suites, banheiros, vagas, area_util, preco, valor_locacao, tipo_de_negocio, imagem_principal').eq('organization_id', organizationId).eq('status', 'ativo').eq('destaque', true).order('created_at', { ascending: false }).limit(6),
          supabase.from('properties').select('id, code, title, bairro, cidade, uf, quartos, suites, banheiros, vagas, area_util, preco, valor_locacao, tipo_de_negocio, imagem_principal').eq('organization_id', organizationId).eq('status', 'ativo').eq('exclusividade', true).order('created_at', { ascending: false }).limit(6),
          supabase.from('properties').select('id, code, title, bairro, cidade, uf, quartos, suites, banheiros, vagas, area_util, preco, valor_locacao, tipo_de_negocio, imagem_principal').eq('organization_id', organizationId).eq('status', 'ativo').order('created_at', { ascending: false }).limit(6),
          supabase.from('properties').select('tipo_de_imovel').eq('organization_id', organizationId).eq('status', 'ativo').not('tipo_de_imovel', 'is', null),
          supabase.from('properties').select('cidade').eq('organization_id', organizationId).eq('status', 'ativo').not('cidade', 'is', null)
        ]);

        const types = [...new Set(typesData?.map(p => p.tipo_de_imovel).filter(Boolean))];
        const cities = [...new Set(citiesData?.map(p => p.cidade).filter(Boolean))];

        response = {
          featured: featured || [],
          exclusive: exclusive || [],
          latest: latest || [],
          types,
          cities
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid endpoint' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300',
        } 
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
