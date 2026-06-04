import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PropertyMapping {
  property_id: string;
  wp_page_url: string;
}

async function scrapeImagesFromWpPage(url: string): Promise<{ mainImage: string | null; gallery: string[] }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ViMobe-Importer/1.0)' },
    });
    if (!res.ok) {
      console.warn(`Page fetch failed: ${res.status} for ${url}`);
      return { mainImage: null, gallery: [] };
    }
    const html = await res.text();
    
    // Extract all image URLs from wp-content/uploads
    const imgRegex = /https?:\/\/queroumimovel\.com\.br\/wp-content\/uploads\/[^\s"'<>]+\.(jpe?g|png|webp)/gi;
    const allMatches = [...new Set(html.match(imgRegex) || [])];
    
    // Filter out thumbnails and duplicates (keep full-size images)
    const fullSizeImages = allMatches
      .filter(url => !url.match(/-\d+x\d+\.(jpe?g|png|webp)$/i)) // Exclude resized versions
      .filter(url => !url.includes('150x150')) // Exclude small thumbnails
      .filter(url => !url.includes('Logotipo')); // Exclude logo
    
    // If no full-size, use all matches
    const images = fullSizeImages.length > 0 ? fullSizeImages : allMatches.filter(u => !u.includes('Logotipo'));
    
    const mainImage = images.length > 0 ? images[0] : null;
    const gallery = images.slice(1);
    
    console.log(`Scraped ${url}: found ${images.length} images`);
    return { mainImage, gallery };
  } catch (e) {
    console.error(`Error scraping ${url}:`, e);
    return { mainImage: null, gallery: [] };
  }
}

async function downloadImage(url: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ViMobe-Importer/1.0)' },
    });
    if (!res.ok) {
      console.warn(`Download failed for ${url}: ${res.status}`);
      return null;
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuf = await res.arrayBuffer();
    return { data: new Uint8Array(arrayBuf), contentType };
  } catch (e) {
    console.error(`Error downloading ${url}:`, e);
    return null;
  }
}

function getExtFromUrl(url: string): string {
  const match = url.match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id, property_mappings, max_gallery = 15 } = await req.json() as {
      organization_id: string;
      property_mappings: PropertyMapping[];
      max_gallery?: number;
    };

    if (!organization_id || !property_mappings?.length) {
      return new Response(
        JSON.stringify({ error: 'organization_id and property_mappings required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: any[] = [];

    for (const mapping of property_mappings) {
      const { property_id, wp_page_url } = mapping;
      console.log(`Processing property ${property_id} from ${wp_page_url}`);

      // 1. Scrape images from WP page
      const { mainImage, gallery } = await scrapeImagesFromWpPage(wp_page_url);
      
      let mainImageStorageUrl: string | null = null;
      const galleryStorageUrls: string[] = [];

      // 2. Download & upload main image
      if (mainImage) {
        const img = await downloadImage(mainImage);
        if (img) {
          const ext = getExtFromUrl(mainImage);
          const path = `orgs/${organization_id}/properties/${property_id}/main.${ext}`;
          const { error } = await supabase.storage
            .from('properties')
            .upload(path, img.data, { contentType: img.contentType, upsert: true });
          if (!error) {
            const { data: urlData } = supabase.storage.from('properties').getPublicUrl(path);
            mainImageStorageUrl = urlData.publicUrl;
          } else {
            console.error(`Storage upload error (main): ${error.message}`);
          }
        }
      }

      // 3. Download & upload gallery (limited)
      const limitedGallery = gallery.slice(0, max_gallery);
      for (let i = 0; i < limitedGallery.length; i++) {
        const img = await downloadImage(limitedGallery[i]);
        if (!img) continue;

        const ext = getExtFromUrl(limitedGallery[i]);
        const path = `orgs/${organization_id}/properties/${property_id}/gallery-${i}.${ext}`;
        const { error } = await supabase.storage
          .from('properties')
          .upload(path, img.data, { contentType: img.contentType, upsert: true });
        if (!error) {
          const { data: urlData } = supabase.storage.from('properties').getPublicUrl(path);
          galleryStorageUrls.push(urlData.publicUrl);
        }
        // Small delay
        await new Promise(r => setTimeout(r, 100));
      }

      // 4. Update property in database
      const updateData: any = {};
      if (mainImageStorageUrl) updateData.imagem_principal = mainImageStorageUrl;
      if (galleryStorageUrls.length > 0) updateData.fotos = galleryStorageUrls;

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('properties')
          .update(updateData)
          .eq('id', property_id);
        if (updateError) {
          console.error(`DB update error for ${property_id}: ${updateError.message}`);
        }
      }

      results.push({
        property_id,
        main_image: mainImageStorageUrl ? 'ok' : 'failed',
        gallery_count: galleryStorageUrls.length,
        total_found: (mainImage ? 1 : 0) + gallery.length,
      });

      console.log(`Done property ${property_id}: main=${mainImageStorageUrl ? 'ok' : 'failed'}, gallery=${galleryStorageUrls.length}`);
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
