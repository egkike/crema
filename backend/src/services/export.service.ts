import { Parser } from 'json2csv';

import { adminRepository } from '../repositories/admin.repository';
import { payoutRepository } from '../repositories/payout.repository';

export class ExportService {
  /**
   * REPORTE MAESTRO: Genera el CSV del Libro Mayor para Cierre Contable.
   * Cruza Ingresos (Ventas) y Egresos (Retiros de Plataforma) con desglose impositivo.
   */
  static async exportMonthlyLedgerToCSV(
    currency: string,
    from: string,
    to: string
  ): Promise<string> {
    // Obtenemos los movimientos del periodo usando tu lógica de adminRepository
    const ledgerEntries = await adminRepository.getPlatformLedger(currency, from, to);

    const fields = [
      { label: 'Fecha', value: 'created_at' },
      { label: 'Tipo de Movimiento', value: 'entry_type' }, // INCOME o EXPENSE
      { label: 'Descripción', value: 'description' },
      { label: 'Monto Bruto', value: 'amount' },
      { label: 'Impuesto Retenido (Tax)', value: 'tax_amount' },
      { label: 'Ganancia Neta Crema', value: 'net_gain' },
      { label: 'Moneda', value: 'currency' },
      { label: 'Admin Responsable', value: 'admin_name' },
      { label: 'Comprobante/Recibo', value: 'transaction_receipt' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(ledgerEntries);
  }

  /**
   * Genera un CSV con el historial de reembolsos
   */
  static async exportRefundsToCSV(currency: string): Promise<string> {
    const refunds = await adminRepository.getRecentRefunds(currency, 1000); // Exportamos hasta los últimos 1000

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
    currency: string,
    status?: string,
    startDate?: string,
    endDate?: string
  ): Promise<string> {
    // Usamos el nuevo método con filtros
    const payouts = await payoutRepository.getForExport(currency, status, startDate, endDate);

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

  static async exportFinancialAuditCSV(currency: string): Promise<string> {
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
