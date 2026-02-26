import crypto from 'crypto';

import { config } from '../../config/index';
import logger from '../logger';

class StreamingUtil {
  /**
   * Genera una URL firmada para Cloudflare Stream.
   * @param contentUrl El ID del video o la URL base de Cloudflare
   * @param contentType Tipo de contenido (video)
   */
  public async getSignedUrl(contentUrl: string, contentType: string): Promise<string> {
    if (!contentUrl || contentType !== 'video') return contentUrl;

    try {
      // Si la URL es de Cloudflare, la firmamos
      if (contentUrl.includes('cloudflarestream.com') || !contentUrl.startsWith('http')) {
        return this.signCloudflareUrl(contentUrl);
      }

      return contentUrl;
    } catch (error: any) {
      logger.error(
        { error: error.message, contentUrl },
        'Error en el proceso de firma de streaming'
      );
      return contentUrl;
    }
  }

  /**
   * Crea un token JWT firmado para Cloudflare Stream usando HMAC-SHA256
   */
  private signCloudflareUrl(videoIdOrUrl: string): string {
    const { cloudflareKeyId, cloudflareKeySecret } = config.streaming;

    // Si no hay llaves configuradas, devolvemos la URL original (útil en dev)
    if (!cloudflareKeyId || !cloudflareKeySecret) {
      logger.warn('Cloudflare Stream keys no configuradas, devolviendo URL sin firma');
      return videoIdOrUrl;
    }

    // Extraer el Video ID si viene una URL completa
    const videoId = videoIdOrUrl.split('/').pop()?.replace('watch', '') || videoIdOrUrl;

    // 1. Definir el Header del JWT
    const header = {
      alg: 'HS256',
      typ: 'JWT',
      kid: cloudflareKeyId,
    };

    // 2. Definir el Payload (expira en 1 hora por defecto)
    const epochNow = Math.floor(Date.now() / 1000);
    const payload = {
      sub: videoId,
      kid: cloudflareKeyId,
      exp: epochNow + 3600, // + 1 hora
      nbf: epochNow - 60, // Un minuto de margen por desajustes de reloj
    };

    // 3. Serializar y codificar en Base64Url
    const base64UrlHeader = this.toBase64Url(JSON.stringify(header));
    const base64UrlPayload = this.toBase64Url(JSON.stringify(payload));

    // 4. Generar la Firma HMAC-SHA256
    const signature = crypto
      .createHmac('sha256', Buffer.from(cloudflareKeySecret, 'base64'))
      .update(`${base64UrlHeader}.${base64UrlPayload}`)
      .digest();

    const base64UrlSignature = signature
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // 5. Construir la URL final con el token
    const jwt = `${base64UrlHeader}.${base64UrlPayload}.${base64UrlSignature}`;
    return `https://customer-${config.streaming.cloudflareAccountId}.cloudflarestream.com/${jwt}/watch`;
  }

  /**
   * Helper para convertir strings a Base64Url (estándar JWT)
   */
  private toBase64Url(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}

export const streamingUtil = new StreamingUtil();
