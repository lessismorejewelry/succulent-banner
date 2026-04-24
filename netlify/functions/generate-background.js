exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing OPENAI_API_KEY in Netlify environment variables.' })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const userPrompt = (body.prompt || '').trim();
    if (!userPrompt) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Prompt is required.' }) };
    }

    const month = body.month || '';
    const plants = Array.isArray(body.plants) ? body.plants.filter(Boolean) : [];
    const formatName = body.formatName || 'Banner';
    const width = Number(body.width) || 1024;
    const height = Number(body.height) || 1024;
    
    // Map custom sizes to DALL-E-3 compatible sizes
    let dalleSize = '1024x1024'; // default
    const w = Number(body.width);
    const h = Number(body.height);
    
    if (w > h) {
      dalleSize = '1792x1024'; // landscape
    } else if (w < h) {
      dalleSize = '1024x1792'; // portrait
    }
    // else dalleSize stays 1024x1024 (square)

    const orientation = width > height ? 'landscape' : (width < height ? 'portrait' : 'square');

    const prompt = [
      `Create premium background artwork for a succulent subscription banner in a ${orientation} composition.`,
      `Format: ${formatName} (${width}x${height}).`,
      'Leave generous clean space for title text and a row or grid of five plant cutouts.',
      'Do not include text, logos, labels, products, people, pots, or watermarks.',
      `Theme request: ${userPrompt}.`,
      `Context: ${month}${plants.length ? `, selected plants: ${plants.join(', ')}` : ''}.`,
      'Style: beautiful, detailed, premium, decorative, polished, elegant botanical marketing artwork.'
    ].join(' ');

    const requestBody = {
      model: 'dall-e-3', // FIXED: was 'gpt-image-1' (invalid)
      size: dalleSize, // FIXED: now uses valid DALL-E-3 sizes
      quality: 'standard', // Changed from 'high' to reduce costs
      response_format: 'b64_json', // FIXED: was 'output_format' (wrong param name)
      prompt
    };

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data?.error?.message || 'OpenAI image generation failed.',
          details: data?.error?.type,
          debug: data
        })
      };
    }

    const item = Array.isArray(data?.data) ? data.data[0] : null;
    const b64 =
      item?.b64_json ||
      item?.base64 ||
      item?.image_base64 ||
      item?.png_base64 ||
      item?.image ||
      null;

    const imageUrl =
      item?.url ||
      item?.image_url ||
      item?.imageUrl ||
      null;

    if (!b64 && !imageUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'No image returned from OpenAI.',
          debug: {
            topLevelKeys: Object.keys(data || {}),
            dataType: Array.isArray(data?.data) ? 'array' : typeof data?.data,
            firstItemKeys: item ? Object.keys(item) : [],
            raw: data
          }
        })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: b64 ? `data:image/png;base64,${b64}` : imageUrl
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Unexpected server error.'
      })
    };
  }
};
