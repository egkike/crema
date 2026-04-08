import crypto from 'crypto';

import { config } from '../config/index';

import logger from './logger';

class StreamingUtil {
  /**
   * Genera una URL firmada para Mux Video.
   * @param playbackId El ID del video (guardado en content_url)
   * @param contentType Tipo de contenido (video)
   */
  public async getSignedUrl(playbackId: string, contentType: string): Promise<string> {
    // Si no es video o no hay ID, devolvemos lo que llegó
    if (!playbackId || contentType !== 'video') return playbackId;

    try {
      // Si parece un playback ID de Mux (alfanumérico corto), lo firmamos
      // O si prefieres, puedes validar que no sea una URL externa HTTP
      if (!playbackId.startsWith('http')) {
        return this.signMuxUrl(playbackId);
      }

      return playbackId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMessage, playbackId },
        'Error en el proceso de firma de streaming con Mux'
      );
      return playbackId;
    }
  }

  /**
   * Crea un token JWT firmado para Mux usando RS256
   */
  private signMuxUrl(playbackId: string): string {
    const { signingKeyId, signingKey } = config.mux;

    if (!signingKeyId || !signingKey) {
      logger.warn('Mux Signing keys no configuradas, devolviendo ID sin firma');
      return playbackId;
    }

    // 1. Definir el Header del JWT (Mux requiere RS256)
    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: signingKeyId,
    };

    // 2. Definir el Payload
    const epochNow = Math.floor(Date.now() / 1000);
    const payload = {
      sub: playbackId,
      aud: 'v', // 'v' indica que el token es para Video Playback
      exp: epochNow + 3600, // + 1 hora
      kid: signingKeyId,
    };

    // 3. Codificar Header y Payload
    const base64UrlHeader = this.toBase64Url(JSON.stringify(header));
    const base64UrlPayload = this.toBase64Url(JSON.stringify(payload));
    const tokenData = `${base64UrlHeader}.${base64UrlPayload}`;

    // 4. Generar la Firma usando RSA-SHA256 (RS256)
    // Mux entrega la llave privada en formato Base64 o PEM
    const privateKeyBuffer = Buffer.from(signingKey, 'base64');

    const signature = crypto.sign('sha256', Buffer.from(tokenData), {
      key: privateKeyBuffer,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    });

    const base64UrlSignature = signature
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // 5. Construir el JWT y la URL de stream HLS (.m3u8)
    const jwt = `${tokenData}.${base64UrlSignature}`;

    // Mux utiliza el formato .m3u8 para streaming adaptativo
    return `https://stream.mux.com/${playbackId}.m3u8?token=${jwt}`;
  }

  /**
   * Helper para convertir strings o buffers a Base64Url
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
