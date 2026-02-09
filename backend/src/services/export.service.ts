import { Parser } from 'json2csv';

import { adminRepository } from '../repositories/admin.repository';
import { payoutRepository } from '../repositories/payout.repository';

export class ExportService {
  /**
   * Genera un CSV con el historial de reembolsos
   */
  static async exportRefundsToCSV(): Promise<string> {
    const refunds = await adminRepository.getRecentRefunds(1000); // Exportamos hasta los últimos 1000

    const fields = [
      { label: 'ID Reembolso', value: 'id' },
      { label: 'Orden ID', value: 'order_id' },
      { label: 'Ref. Externa', value: 'external_reference' },
      { label: 'Email Comprador', value: 'buyer_email' },
      { label: 'Monto', value: 'amount' },
      { label: 'Moneda', value: 'currency' },
      { label: 'Razón', value: 'reason' },
      { label: 'Fecha', value: 'created_at' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(refunds);
  }

  /**
   * Genera un CSV con los retiros (payouts) para contabilidad
   */
  static async exportPayoutsToCSV(status?: string): Promise<string> {
    // Si hay status usamos el existente, si no, el nuevo getAll
    const payouts = status
      ? await payoutRepository.getByStatus(status)
      : await payoutRepository.getAll();

    const fields = [
      { label: 'Fecha', value: 'created_at' },
      { label: 'Usuario', value: 'fullname' },
      { label: 'Email', value: 'email' },
      { label: 'Monto', value: 'amount' },
      { label: 'Moneda', value: 'currency' },
      { label: 'Estado', value: 'status' },
      { label: 'Cuenta Destino', value: 'destination_account' },
      { label: 'Banco/Alias', value: 'alias' },
      { label: 'Notas Admin', value: 'admin_notes' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(payouts);
  }
}
