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
  static async exportPayoutsToCSV(
    status?: string,
    startDate?: string,
    endDate?: string
  ): Promise<string> {
    // Usamos el nuevo método con filtros
    const payouts = await payoutRepository.getForExport(status, startDate, endDate);

    const fields = [
      { label: 'Fecha Solicitud', value: 'created_at' },
      { label: 'Fecha Procesado', value: 'processed_at' },
      { label: 'Usuario', value: 'fullname' },
      { label: 'Email', value: 'email' },
      { label: 'Monto', value: 'amount' },
      { label: 'Moneda', value: 'currency' },
      { label: 'Estado', value: 'status' },
      { label: 'Cuenta Destino', value: 'destination_account' },
      { label: 'ID Transacción Bancaria', value: 'transaction_receipt' },
      { label: 'Notas Admin', value: 'admin_notes' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(payouts);
  }

  static async exportFinancialAuditCSV(currency: string = 'ARS'): Promise<string> {
    const data = await adminRepository.getReconciliationDetail(currency);

    const fields = [
      { label: 'Orden ID', value: 'id' },
      { label: 'Monto Total', value: 'amount' },
      { label: 'Estado Liberación', value: 'balance_released' },
      { label: 'Fecha Compra', value: 'created_at' },
      { label: 'Fecha Liberación Est.', value: 'release_date' },
      { label: 'Garantía Expirada', value: 'guarantee_expired' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(data);
  }
}
